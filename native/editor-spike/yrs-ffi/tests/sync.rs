use yrs_ffi::{SpikeDoc, TextDelta};

/// Run the y-protocols handshake between two docs the way the Hocuspocus
/// client and server do: each side sends SyncStep1, the other answers with
/// SyncStep2, and both sides apply what they receive.
fn handshake(a: &SpikeDoc, b: &SpikeDoc) -> (Vec<Vec<TextDelta>>, Vec<Vec<TextDelta>>) {
    let mut a_deltas = Vec::new();
    let mut b_deltas = Vec::new();
    let from_b = b.receive(a.sync_step1()).unwrap();
    b_deltas.extend(from_b.deltas);
    for reply in from_b.replies {
        a_deltas.extend(a.receive(reply).unwrap().deltas);
    }
    let from_a = a.receive(b.sync_step1()).unwrap();
    a_deltas.extend(from_a.deltas);
    for reply in from_a.replies {
        b_deltas.extend(b.receive(reply).unwrap().deltas);
    }
    (a_deltas, b_deltas)
}

#[test]
fn offsets_are_utf16_code_units() {
    let doc = SpikeDoc::new();
    // "한글" is 2 UTF-16 units (6 UTF-8 bytes); "😀" is 2 UTF-16 units.
    doc.local_edit(0, 0, "한글😀끝".into()).unwrap();
    assert_eq!(doc.len(), 5);
    // Insert after the emoji: index 4 in UTF-16, would be 10 in UTF-8.
    doc.local_edit(4, 0, "X".into()).unwrap();
    assert_eq!(doc.text(), "한글😀X끝");
    // Delete the emoji (2 units).
    doc.local_edit(2, 2, String::new()).unwrap();
    assert_eq!(doc.text(), "한글X끝");
}

#[test]
fn out_of_range_edit_is_rejected() {
    let doc = SpikeDoc::new();
    doc.local_edit(0, 0, "abc".into()).unwrap();
    assert!(doc.local_edit(2, 5, String::new()).is_err());
    assert_eq!(doc.text(), "abc");
}

#[test]
fn local_edit_update_reaches_peer_as_delta() {
    let a = SpikeDoc::new();
    let b = SpikeDoc::new();
    a.local_edit(0, 0, "# 제목\n\n본문".into()).unwrap();
    handshake(&a, &b);
    assert_eq!(b.text(), "# 제목\n\n본문");

    let message = a.local_edit(2, 2, "새 제목".into()).unwrap().expect("edit yields update");
    let result = b.receive(message).unwrap();
    assert!(result.replies.is_empty());
    assert_eq!(b.text(), "# 새 제목\n\n본문");
    assert_eq!(
        result.deltas,
        vec![vec![
            TextDelta::Retain { len: 2 },
            TextDelta::Delete { len: 2 },
            TextDelta::Insert { text: "새 제목".into() },
        ]]
    );
}

#[test]
fn local_edits_do_not_echo_as_remote_deltas() {
    let doc = SpikeDoc::new();
    doc.local_edit(0, 0, "abc".into()).unwrap();
    let peer = SpikeDoc::new();
    let (doc_deltas, _) = handshake(&doc, &peer);
    // The only delta `doc` sees is none — peer had nothing to send.
    assert!(doc_deltas.iter().all(|d| d.is_empty()));
}

#[test]
fn concurrent_edits_converge() {
    let a = SpikeDoc::new();
    let b = SpikeDoc::new();
    a.local_edit(0, 0, "line one\nline two\n".into()).unwrap();
    handshake(&a, &b);

    let from_a = a.local_edit(4, 0, " A".into()).unwrap().unwrap();
    let from_b = b.local_edit(13, 0, " B".into()).unwrap().unwrap();
    b.receive(from_a).unwrap();
    a.receive(from_b).unwrap();
    assert_eq!(a.text(), b.text());
    assert_eq!(a.text(), "line A one\nline B two\n");
}

#[test]
fn noop_edit_yields_no_update() {
    let doc = SpikeDoc::new();
    assert!(doc.local_edit(0, 0, String::new()).unwrap().is_none());
}
