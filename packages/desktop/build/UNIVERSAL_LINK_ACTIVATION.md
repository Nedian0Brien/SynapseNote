# SynapseNote Universal Link activation

Universal Links are intentionally disabled after the SynapseNote rebrand. The upstream provisioning profile was issued for a different bundle ID and must not be shipped with `kr.lawdigest.synapsenote`.

The `synapsenote://` custom protocol remains enabled as the share-link fallback.

To enable Universal Links safely:

1. Register `kr.lawdigest.synapsenote` with the Apple Developer account used to sign SynapseNote.
2. Add the Associated Domains capability for `applinks:synapse.lawdigest.kr`.
3. Create a Developer ID provisioning profile for that bundle ID and place it in `packages/desktop/build/`.
4. Add `com.apple.developer.associated-domains` with `applinks:synapse.lawdigest.kr` to `entitlements.mac.plist`.
5. Set `mac.provisioningProfile` in `electron-builder.yml` to the new profile.
6. Set `SYNAPSENOTE_APPLE_TEAM_ID` while building the docs site so the AASA response contains the matching application identifier.
7. Verify the signed app's entitlements and the deployed AASA response before publishing a DMG.

Do not reuse the old OpenKnowledge team ID, provisioning profile, or bundle identifier. A profile and entitlement mismatch makes signed builds fail or causes macOS to reject helper processes.
