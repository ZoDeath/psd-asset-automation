# PSD Asset Automation

Photoshop 2024 UXP 패널, Codex MCP 서버, 로컬 Python 얼굴 분석기를 연결해 제작을 자동화하는 프로젝트다.

## 구성

- `photoshop-uxp-plugin`: Photoshop 문서 조회와 스마트 오브젝트 내부 사진 배치
- `mcp-server`: Codex와 UXP 사이의 명령·스냅샷 브리지
- `mcp-server/vision`: 작업용 PC에서 실행되는 얼굴 위치·회전 분석
- `assets/Photo`: 현재 개발용 원본 사진 폴더
- `docs/RHV_WORK_LOG.md`: Photoshop 작업 기준과 누적 결정
- `docs/ARCHITECTURE.md`: 현재 모듈 구조와 불변 조건

## 개발 연결

1. `mcp-server`에서 `npm run build` 후 `dist/index.js`를 MCP 서버로 실행한다.
2. Adobe UXP Developer Tool에서 `photoshop-uxp-plugin/manifest.json`을 추가하고 로드한다.
3. Photoshop에서 **RHV Art Asset Automation** 패널을 연다.
4. 로컬 브리지 `127.0.0.1:61234`와 얼굴 분석 서비스 `127.0.0.1:61235`를 사용한다.

실제 PSD 작업 전에는 반드시 [작업 로그](docs/RHV_WORK_LOG.md)와 [아키텍처 문서](docs/ARCHITECTURE.md)를 확인한다.
