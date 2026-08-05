# RHV Art Asset Automation 아키텍처

## 실행 흐름

1. Codex MCP 클라이언트가 `mcp-server`에 Photoshop 명령을 요청한다.
2. MCP 서버의 `CommandQueue`가 명령을 보관한다.
3. Photoshop 2024의 UXP 패널이 로컬 브리지에서 명령을 가져간다.
4. UXP 명령 어댑터가 대상 PSD를 먼저 선택한 뒤 해당 기능 모듈을 호출한다.
5. 사진 자동 배치는 로컬 Python 얼굴 분석 결과를 받아 Photoshop 내부 PSB에서만 수행한다.
6. 내부 PSB 저장·닫기 후 부모 PSD를 저장하고, 최종 스냅샷과 실행 결과를 MCP 서버로 보낸다.

모든 통신은 작업용 PC의 `127.0.0.1`에서만 이루어진다. 원본 사진은 외부 서버로 전송하지 않는다.

## MCP 서버

- `src/index.ts`: 기존 MCP 설정을 유지하기 위한 최소 호환 진입점
- `src/app.ts`: MCP 도구 등록과 서비스 조립
- `src/bridge.ts`: HTTP/WebSocket 브리지와 Photoshop 접속 상태
- `src/commandQueue.ts`: 명령 대기열, 완료 및 시간초과 처리
- `src/visionClient.ts`: 상주 Python 분석 서비스와 단발 실행 폴백
- `src/types.ts`: 브리지 공용 타입
- `vision/server.py`: 로컬 얼굴 분석 HTTP 서비스와 결과 캐시
- `vision/analyze_face.py`: 얼굴 위치와 회전 추정

## Photoshop UXP 패널

- `index.js`: UI와 기능 모듈을 연결하는 조립 전용 진입점
- `src/bridge/remoteCommands.js`: 명령 폴링과 결과 전송
- `src/bridge/commandHandlers.js`: 명령명과 기능 호출 매핑
- `src/features/placementController.js`: 단일·일괄 배치 흐름과 UI 상태
- `src/features/smartObjectPlacement.js`: PSB 열기, 사진 삽입, 정리, 저장·닫기
- `src/features/photoAnalysis.js`: 로컬 분석 API 호출
- `src/features/photoFiles.js`: 사진 폴더 권한과 멤버 파일 검색
- `src/features/photoTransform.js`: 비례 확대·축소, 회전, 위치 계산
- `src/features/faceGuide.js`: 공통 얼굴 가이드 좌표
- `src/features/inspection.js`: 멤버 스마트 오브젝트 검사
- `src/features/snapshot.js`: 읽기 스냅샷과 미리보기 전송
- `src/features/naming.js`: 네이밍 기능
- `src/photoshop/*`: 문서·레이어 조회와 범용 Photoshop 작업

## 반드시 유지할 불변 조건

- 사진은 `Card_Photo_<MEMBER>_BTS` 내부 스마트 오브젝트에서만 수정한다.
- 확대·축소는 가로와 세로에 같은 배율을 사용한다.
- 새 사진 배치와 이동이 성공하기 전에는 기존 사진 레이어를 삭제하지 않는다.
- `Face_Guide`는 보존하며 `Shape 5` 더미 표시 상태를 명시적으로 처리한다.
- 내부 PSB 이름 등 닫은 뒤 무효가 되는 Photoshop DOM 값은 닫기 전에 복사한다.
- 내부 PSB를 저장하고 닫은 뒤 부모 PSD를 저장한다.
- 자동 배치 결과는 ALLNEW 기준 PSD와 시각적으로 비교하기 전까지 최종 규칙으로 확정하지 않는다.

## 현재 적용된 성능·안정성 개선

- OpenCV와 분류기를 요청마다 다시 시작하지 않고 상주 서비스에서 재사용한다.
- 같은 파일은 경로, 수정 시각, 크기를 키로 최대 64개까지 분석 결과를 캐시한다.
- 얼굴은 우선 0도에서 찾고 실패한 경우에만 ±35도 탐색을 수행한다.
- 여러 멤버 배치에서는 내부 PSB는 각각 저장하되 무거운 부모 PSD 저장은 마지막에 한 번만 수행한다.
- 일괄 배치에서는 사진 폴더 목록을 한 번만 읽고 멤버별 검색에 재사용한다.
- `batch_place_members`에 멤버 목록이 없으면 활성 템플릿의 멤버 목록을 사용한다.
- 시간초과된 명령은 큐에서도 제거해 재연결 후 뒤늦게 실행되지 않게 한다.
- UXP 폴링 시각을 기준으로 실제 플러그인 접속 상태를 계산한다.
- 자동 배치 전 얼굴 분석 성공 여부를 확인하고, 실패하면 Photoshop 문서를 변경하지 않는다.

## 현재 한계

- Haar 기반 얼굴 검출은 로컬 PoC 단계다. 가림, 극단적인 측면 얼굴, 복수 인물에는 별도 랜드마크 모델이 필요하다.
- UXP 파일은 호스트 전용 API를 사용하므로 Node 문법 검사만으로 Photoshop 동작을 완전히 증명할 수 없다. 패널 재로딩 후 제작용 PSD에서 실제 배치 확인이 필요하다.
- 그룹별 카드 프레임과 얼굴 가이드가 다르면 템플릿 프로필과 가이드 값을 그룹 단위로 추가해야 한다.
