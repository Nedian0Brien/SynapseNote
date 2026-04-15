# Runtime Data Policy

이 디렉터리는 문서 전용 placeholder입니다.

실제 런타임 데이터는 레포 외부 경로를 사용합니다.
기본 권장 경로:

- `${RUNTIME_ROOT}/backups`
- `${RUNTIME_ROOT}/rclone/rclone.conf`

권장 기본값:
- `RUNTIME_ROOT=/srv/SynapseNote`

초기 준비 예시:

```bash
sudo mkdir -p /srv/SynapseNote/backups
sudo mkdir -p /srv/SynapseNote/rclone
sudo touch /srv/SynapseNote/rclone/rclone.conf
sudo chown -R ubuntu:ubuntu /srv/SynapseNote
```

운영 중 생성되는 아카이브/임시 데이터는 이 레포에 저장하지 않습니다.
