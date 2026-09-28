//! yrs must apply an edit that splits a surrogate pair the way Yjs does.
//! Fixtures come from scripts/gen-surrogate-fixtures.ts: updates made by a
//! Yjs doc and the text a receiving Yjs peer ends with.
use yrs::sync::{Message, SyncMessage};
use yrs::updates::encoder::Encode;
use yrs_ffi::SpikeDoc;

fn hex(s: &str) -> Vec<u8> {
    (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap()).collect()
}

/// Decode the JSON string the generator wrote (only \uXXXX escapes appear).
fn json_string(s: &str) -> String {
    let inner = &s[1..s.len() - 1];
    let units: Vec<u16> = {
        let mut out = Vec::new();
        let mut chars = inner.chars().peekable();
        while let Some(c) = chars.next() {
            if c == '\\' && chars.peek() == Some(&'u') {
                chars.next();
                let code: String = (0..4).map(|_| chars.next().unwrap()).collect();
                out.push(u16::from_str_radix(&code, 16).unwrap());
            } else {
                let mut buf = [0u16; 2];
                out.extend_from_slice(c.encode_utf16(&mut buf));
            }
        }
        out
    };
    String::from_utf16(&units).expect("peer text is well formed")
}

#[test]
fn split_pairs_match_a_yjs_peer() {
    let fixtures = include_str!("fixtures/surrogate-splits.tsv");
    for line in fixtures.lines().filter(|l| !l.is_empty()) {
        let fields: Vec<&str> = line.split('\t').collect();
        let doc = SpikeDoc::new();
        for update in &fields[1..3] {
            doc.receive(Message::Sync(SyncMessage::Update(hex(update))).encode_v1()).unwrap();
        }
        assert_eq!(doc.text(), json_string(fields[3]), "case {}", fields[0]);
    }
}
