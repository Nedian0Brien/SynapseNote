//! UniFFI surface over `yrs` for the SynapseNote Apple apps.
//!
//! The apps sync one shared type, `Y.Text('source')` — the full Markdown file
//! the server treats as truth. The surface: local text edits that return the
//! update to broadcast, inbound y-protocols sync messages that return the
//! replies to send plus the text deltas to apply to the view, and undo/redo of
//! this client's own edits. Hocuspocus framing (document-name prefix, auth,
//! ping) stays in Swift.
//!
//! Offsets are UTF-16 code units (`OffsetKind::Utf16`), the unit both JS
//! strings on the server and `NSString` use. yrs defaults to UTF-8 bytes,
//! which would misplace every edit after a non-ASCII character.

use std::collections::HashSet;
use std::sync::{Arc, Mutex};

use yrs::sync::{Message, SyncMessage};
use yrs::types::Delta;
use yrs::undo::{Options as UndoOptions, UndoManager};
use yrs::updates::decoder::Decode;
use yrs::updates::encoder::Encode;
use yrs::{
    Any, Doc, GetString, Observable, OffsetKind, Options, Origin, Out, ReadTxn, StateVector, Text,
    TextRef, Transact, Update,
};

uniffi::setup_scaffolding!();

const SOURCE_TEXT: &str = "source";
const LOCAL_ORIGIN: &str = "native-local";
const REMOTE_ORIGIN: &str = "native-remote";
const OBSERVER_KEY: &str = "native-source";
/// Edits closer together than this undo as one step (the yrs default, and
/// what Yjs uses for the web editor).
const UNDO_CAPTURE_MILLIS: u64 = 500;

#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum SyncError {
    #[error("decode failed: {reason}")]
    Decode { reason: String },
    #[error("apply failed: {reason}")]
    Apply { reason: String },
    #[error("edit out of range: index {index} + delete {delete_len} > length {length}")]
    OutOfRange {
        index: u32,
        delete_len: u32,
        length: u32,
    },
}

/// One step of a text delta, in UTF-16 code units.
#[derive(Debug, Clone, PartialEq, Eq, uniffi::Enum)]
pub enum TextDelta {
    Retain { len: u32 },
    Insert { text: String },
    Delete { len: u32 },
}

/// Replace `[from, to)` with `insert`, in the offsets the previous change left.
#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct TextChange {
    pub from: u32,
    pub to: u32,
    pub insert: String,
}

/// What handling one inbound sync message produced.
#[derive(Debug, Clone, uniffi::Record)]
pub struct ReceiveResult {
    /// y-protocols messages to send back (without the Hocuspocus prefix).
    pub replies: Vec<Vec<u8>>,
    /// Changes remote transactions made to `Y.Text('source')`, in order.
    pub deltas: Vec<Vec<TextDelta>>,
}

/// What an undo or redo step did.
#[derive(Debug, Clone, uniffi::Record)]
pub struct UndoResult {
    /// False when there was nothing to undo or redo.
    pub applied: bool,
    /// The y-protocols `Update` message to broadcast.
    pub update: Option<Vec<u8>>,
    /// The step's changes to `Y.Text('source')`, to apply to the view.
    pub deltas: Vec<Vec<TextDelta>>,
}

#[derive(uniffi::Object)]
pub struct SourceDoc {
    doc: Doc,
    text: TextRef,
    /// Updates of this client's own transactions (edits and undo/redo), to broadcast.
    outgoing: Arc<Mutex<Vec<Vec<u8>>>>,
    /// Text deltas of transactions the view did not make (remote and undo/redo).
    pending_deltas: Arc<Mutex<Vec<Vec<TextDelta>>>>,
    undo: Mutex<UndoManager<()>>,
}

// `UndoManager` holds observer callbacks behind `Arc`s and is only touched
// through the mutex above; the Swift side calls a `SourceDoc` from the main
// thread only.
unsafe impl Send for SourceDoc {}
unsafe impl Sync for SourceDoc {}

fn origin_is(txn: &yrs::TransactionMut, name: &str) -> bool {
    txn.origin().map(|o| o.as_ref() == name.as_bytes()).unwrap_or(false)
}

fn convert_delta(delta: &[Delta]) -> Vec<TextDelta> {
    delta
        .iter()
        .map(|d| match d {
            Delta::Retain(len, _) => TextDelta::Retain { len: *len },
            Delta::Deleted(len) => TextDelta::Delete { len: *len },
            Delta::Inserted(value, _) => TextDelta::Insert {
                text: match value {
                    Out::Any(Any::String(s)) => s.to_string(),
                    other => other.to_string(),
                },
            },
        })
        .collect()
}

#[uniffi::export]
impl SourceDoc {
    #[uniffi::constructor]
    pub fn new() -> Arc<Self> {
        let doc = Doc::with_options(Options {
            offset_kind: OffsetKind::Utf16,
            ..Options::default()
        });
        let text = doc.get_or_insert_text(SOURCE_TEXT);

        let outgoing = Arc::new(Mutex::new(Vec::new()));
        let sink = outgoing.clone();
        doc.observe_update_v1(OBSERVER_KEY, move |txn, event| {
            if !origin_is(txn, REMOTE_ORIGIN) {
                sink.lock().unwrap().push(event.update.clone());
            }
        })
        .expect("update observer registers on a fresh doc");

        let pending_deltas = Arc::new(Mutex::new(Vec::new()));
        let sink = pending_deltas.clone();
        text.observe(OBSERVER_KEY, move |txn, event| {
            if !origin_is(txn, LOCAL_ORIGIN) {
                sink.lock().unwrap().push(convert_delta(event.delta(txn)));
            }
        });

        let mut tracked = HashSet::new();
        tracked.insert(Origin::from(LOCAL_ORIGIN));
        let mut undo = UndoManager::with_options(UndoOptions {
            capture_timeout_millis: UNDO_CAPTURE_MILLIS,
            tracked_origins: tracked,
            ..UndoOptions::default()
        });
        undo.expand_scope(&doc, &text);

        Arc::new(Self {
            doc,
            text,
            outgoing,
            pending_deltas,
            undo: Mutex::new(undo),
        })
    }

    pub fn text(&self) -> String {
        self.text.get_string(&self.doc.transact())
    }

    /// Length in UTF-16 code units.
    pub fn len(&self) -> u32 {
        self.text.len(&self.doc.transact())
    }

    /// Replace `delete_len` units at `index` with `insert` in one transaction.
    pub fn local_edit(
        &self,
        index: u32,
        delete_len: u32,
        insert: String,
    ) -> Result<Option<Vec<u8>>, SyncError> {
        self.local_edits(vec![TextChange {
            from: index,
            to: index + delete_len,
            insert,
        }])
    }

    /// Apply changes made by the view in one transaction, each in the offsets
    /// the previous one left. Returns the y-protocols `Update` message to
    /// broadcast, or `None` when nothing changed.
    pub fn local_edits(&self, changes: Vec<TextChange>) -> Result<Option<Vec<u8>>, SyncError> {
        {
            let mut txn = self.doc.transact_mut_with(LOCAL_ORIGIN);
            for change in &changes {
                let length = self.text.len(&txn);
                if change.to < change.from || change.to > length {
                    return Err(SyncError::OutOfRange {
                        index: change.from,
                        delete_len: change.to.saturating_sub(change.from),
                        length,
                    });
                }
                if change.to > change.from {
                    self.text.remove_range(&mut txn, change.from, change.to - change.from);
                }
                if !change.insert.is_empty() {
                    self.text.insert(&mut txn, change.from, &change.insert);
                }
            }
        }
        self.take_outgoing()
    }

    /// Undo this client's last step. Remote edits are never undone.
    pub fn undo(&self) -> Result<UndoResult, SyncError> {
        let applied = self.undo.lock().unwrap().undo_blocking();
        self.finish_undo(applied)
    }

    pub fn redo(&self) -> Result<UndoResult, SyncError> {
        let applied = self.undo.lock().unwrap().redo_blocking();
        self.finish_undo(applied)
    }

    pub fn can_undo(&self) -> bool {
        self.undo.lock().unwrap().can_undo()
    }

    pub fn can_redo(&self) -> bool {
        self.undo.lock().unwrap().can_redo()
    }

    /// Start a new undo step even if the next edit comes within the capture timeout.
    pub fn stop_capturing(&self) {
        self.undo.lock().unwrap().reset();
    }

    /// SyncStep1 carrying this doc's state vector.
    pub fn sync_step1(&self) -> Vec<u8> {
        let sv = self.doc.transact().state_vector();
        Message::Sync(SyncMessage::SyncStep1(sv)).encode_v1()
    }

    /// Handle one inbound y-protocols message (the bytes after the
    /// Hocuspocus document-name prefix, starting with the message tag).
    /// Non-sync messages (awareness, auth, custom) are ignored.
    pub fn receive(&self, message: Vec<u8>) -> Result<ReceiveResult, SyncError> {
        let decoded = Message::decode_v1(&message).map_err(|e| SyncError::Decode {
            reason: e.to_string(),
        })?;
        let mut replies = Vec::new();
        match decoded {
            Message::Sync(SyncMessage::SyncStep1(sv)) => {
                let update = self.doc.transact().encode_state_as_update_v1(&sv);
                replies.push(Message::Sync(SyncMessage::SyncStep2(update)).encode_v1());
            }
            Message::Sync(SyncMessage::SyncStep2(bytes))
            | Message::Sync(SyncMessage::Update(bytes)) => {
                let update = Update::decode_v1(&bytes).map_err(|e| SyncError::Decode {
                    reason: e.to_string(),
                })?;
                let mut txn = self.doc.transact_mut_with(REMOTE_ORIGIN);
                txn.apply_update(update).map_err(|e| SyncError::Apply {
                    reason: e.to_string(),
                })?;
            }
            _ => {}
        }
        let deltas = self.pending_deltas.lock().unwrap().drain(..).collect();
        Ok(ReceiveResult { replies, deltas })
    }
}

impl SourceDoc {
    fn take_outgoing(&self) -> Result<Option<Vec<u8>>, SyncError> {
        let updates: Vec<Vec<u8>> = self.outgoing.lock().unwrap().drain(..).collect();
        Ok(match updates.len() {
            0 => None,
            1 => Some(update_message(updates.into_iter().next().unwrap())),
            _ => Some(update_message(
                yrs::merge_updates_v1(updates.iter().map(|u| u.as_slice())).map_err(|e| {
                    SyncError::Apply {
                        reason: e.to_string(),
                    }
                })?,
            )),
        })
    }

    fn finish_undo(&self, applied: bool) -> Result<UndoResult, SyncError> {
        let update = self.take_outgoing()?;
        let deltas = self.pending_deltas.lock().unwrap().drain(..).collect();
        Ok(UndoResult {
            applied,
            update,
            deltas,
        })
    }
}

fn update_message(update: Vec<u8>) -> Vec<u8> {
    Message::Sync(SyncMessage::Update(update)).encode_v1()
}

/// Decode a state vector and return the full update relative to it — used by
/// tests to replay one doc into another.
#[uniffi::export]
pub fn state_as_update(doc: &SourceDoc, state_vector: Vec<u8>) -> Result<Vec<u8>, SyncError> {
    let sv = StateVector::decode_v1(&state_vector).map_err(|e| SyncError::Decode {
        reason: e.to_string(),
    })?;
    Ok(doc.doc.transact().encode_state_as_update_v1(&sv))
}
