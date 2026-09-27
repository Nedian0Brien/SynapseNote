//! Minimal UniFFI surface over `yrs` for the native editor spike.
//!
//! The spike syncs one shared type, `Y.Text('source')` — the full file bytes the
//! server treats as truth — so the surface is deliberately small: local text
//! edits that return the update to broadcast, and inbound y-protocols sync
//! messages that return the replies to send plus the text delta to apply to the
//! view. Hocuspocus framing (document-name prefix, auth, ping) stays in Swift.
//!
//! Offsets are UTF-16 code units (`OffsetKind::Utf16`), the unit both JS
//! strings on the server and `NSString` in UIKit use. yrs defaults to UTF-8
//! bytes, which would misplace every edit after a non-ASCII character.

use std::sync::{Arc, Mutex};

use yrs::sync::{Message, SyncMessage};
use yrs::types::Delta;
use yrs::updates::decoder::Decode;
use yrs::updates::encoder::Encode;
use yrs::{
    Any, Doc, GetString, Observable, OffsetKind, Options, Out, ReadTxn, StateVector, Text,
    TextRef, Transact, Update,
};

uniffi::setup_scaffolding!();

const SOURCE_TEXT: &str = "source";
const LOCAL_ORIGIN: &str = "native-local";
const REMOTE_ORIGIN: &str = "native-remote";
const OBSERVER_KEY: &str = "native-spike";

#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum SpikeError {
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

/// What handling one inbound sync message produced.
#[derive(Debug, Clone, uniffi::Record)]
pub struct ReceiveResult {
    /// y-protocols messages to send back (without the Hocuspocus prefix).
    pub replies: Vec<Vec<u8>>,
    /// Changes remote transactions made to `Y.Text('source')`, in order.
    pub deltas: Vec<Vec<TextDelta>>,
}

#[derive(uniffi::Object)]
pub struct SpikeDoc {
    doc: Doc,
    text: TextRef,
    local_updates: Arc<Mutex<Vec<Vec<u8>>>>,
    remote_deltas: Arc<Mutex<Vec<Vec<TextDelta>>>>,
}

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
impl SpikeDoc {
    #[uniffi::constructor]
    pub fn new() -> Arc<Self> {
        let doc = Doc::with_options(Options {
            offset_kind: OffsetKind::Utf16,
            ..Options::default()
        });
        let text = doc.get_or_insert_text(SOURCE_TEXT);

        let local_updates = Arc::new(Mutex::new(Vec::new()));
        let sink = local_updates.clone();
        doc.observe_update_v1(OBSERVER_KEY, move |txn, event| {
            if origin_is(txn, LOCAL_ORIGIN) {
                sink.lock().unwrap().push(event.update.clone());
            }
        })
        .expect("update observer registers on a fresh doc");

        let remote_deltas = Arc::new(Mutex::new(Vec::new()));
        let sink = remote_deltas.clone();
        text.observe(OBSERVER_KEY, move |txn, event| {
            if !origin_is(txn, LOCAL_ORIGIN) {
                sink.lock().unwrap().push(convert_delta(event.delta(txn)));
            }
        });

        Arc::new(Self {
            doc,
            text,
            local_updates,
            remote_deltas,
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
    /// Returns the y-protocols `Update` message to broadcast, or `None` when
    /// the edit was a no-op.
    pub fn local_edit(
        &self,
        index: u32,
        delete_len: u32,
        insert: String,
    ) -> Result<Option<Vec<u8>>, SpikeError> {
        {
            let mut txn = self.doc.transact_mut_with(LOCAL_ORIGIN);
            let length = self.text.len(&txn);
            if index.checked_add(delete_len).map_or(true, |end| end > length) {
                return Err(SpikeError::OutOfRange {
                    index,
                    delete_len,
                    length,
                });
            }
            if delete_len > 0 {
                self.text.remove_range(&mut txn, index, delete_len);
            }
            if !insert.is_empty() {
                self.text.insert(&mut txn, index, &insert);
            }
        }
        let updates: Vec<Vec<u8>> = self.local_updates.lock().unwrap().drain(..).collect();
        Ok(match updates.len() {
            0 => None,
            1 => Some(update_message(updates.into_iter().next().unwrap())),
            _ => Some(update_message(
                yrs::merge_updates_v1(updates.iter().map(|u| u.as_slice())).map_err(|e| {
                    SpikeError::Apply {
                        reason: e.to_string(),
                    }
                })?,
            )),
        })
    }

    /// SyncStep1 carrying this doc's state vector.
    pub fn sync_step1(&self) -> Vec<u8> {
        let sv = self.doc.transact().state_vector();
        Message::Sync(SyncMessage::SyncStep1(sv)).encode_v1()
    }

    /// Handle one inbound y-protocols message (the bytes after the
    /// Hocuspocus document-name prefix, starting with the message tag).
    /// Non-sync messages (awareness, auth, custom) are ignored.
    pub fn receive(&self, message: Vec<u8>) -> Result<ReceiveResult, SpikeError> {
        let decoded = Message::decode_v1(&message).map_err(|e| SpikeError::Decode {
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
                let update = Update::decode_v1(&bytes).map_err(|e| SpikeError::Decode {
                    reason: e.to_string(),
                })?;
                let mut txn = self.doc.transact_mut_with(REMOTE_ORIGIN);
                txn.apply_update(update).map_err(|e| SpikeError::Apply {
                    reason: e.to_string(),
                })?;
            }
            _ => {}
        }
        let deltas = self.remote_deltas.lock().unwrap().drain(..).collect();
        Ok(ReceiveResult { replies, deltas })
    }
}

fn update_message(update: Vec<u8>) -> Vec<u8> {
    Message::Sync(SyncMessage::Update(update)).encode_v1()
}

/// Decode a state vector and return the full update relative to it — used by
/// tests to replay one doc into another.
#[uniffi::export]
pub fn state_as_update(doc: &SpikeDoc, state_vector: Vec<u8>) -> Result<Vec<u8>, SpikeError> {
    let sv = StateVector::decode_v1(&state_vector).map_err(|e| SpikeError::Decode {
        reason: e.to_string(),
    })?;
    Ok(doc.doc.transact().encode_state_as_update_v1(&sv))
}
