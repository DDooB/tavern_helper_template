# tavern_helper_template

주점 도우미(酒馆助手)용 프론트엔드 UI 또는 스크립트를 작성하기 위한 템플릿입니다.

## 사용 방법

어떤 방식으로 사용하든, 사용법을 이해하려면 [튜토리얼 문서](https://stagedog.github.io/青空莉/工具经验/实时编写前端界面或脚本/)를 먼저 읽어 주세요.

### 로컬에서만 사용

웹페이지 오른쪽 위의 초록색 `Code` 버튼에서 `Download ZIP`을 눌러 템플릿 압축 파일을 내려받아 로컬 전용으로 사용할 수 있습니다.

### GitHub 저장소로 사용

다음 두 가지 방법 중 하나로 저장소를 만들 수 있습니다.

- 웹페이지 오른쪽 위의 초록색 `Use this template` 버튼을 클릭
- 또는 오른쪽 위의 `fork` 버튼을 클릭 (단, fork한 저장소의 `Actions` 페이지에서 자동 워크플로를 수동으로 활성화해야 함)

저장소 생성 후에는 워크플로 권한을 설정해야 합니다. 저장소 `Settings -> Actions -> General`에서 `Workflow permissions`를 `Read and write permissions`로 설정하고, `Allow GitHub Actions to create and approve pull requests`를 체크하세요.

## 로컬에서만 사용할 경우

의미하는 바는 다음과 같습니다.

- jsdelivr를 이용한 프론트엔드 UI/스크립트 자동 업데이트를 사용할 수 없음
- 이 템플릿이 제공하는 자동 빌드/자동 업데이트 기능을 사용할 수 없음
  - 코드 업로드 후 `src` 폴더 코드를 `dist` 폴더로 자동 빌드
  - 최신 작성 템플릿, 주점(酒馆) 및 주점 도우미 참고 파일 자동 업데이트 등

그래도 로컬에서는 여전히 편리하게 이 템플릿을 사용할 수 있습니다.

## 새 저장소로 만들 경우

저장소를 만든 뒤에는 저장소 주소를 AI에게 전달해 **`core.symlinks`를 어떻게 활성화하는지** 물어본 후 로컬에 클론해서 사용할 수 있습니다. 또는 [Learn Git Branching](https://learngitbranching.js.org/?locale=zh_CN)으로 git 브랜치와 병합을 학습할 수 있습니다.

#### `.vscode/launch.json` 파일

`.vscode/launch.json`에는 사용자의 주점 주소가 들어 있으므로, 클라우드 주점 IP 노출을 막기 위해 아래 명령으로 변경 사항 추적을 무시하는 것을 권장합니다.

```bash
git update-index --skip-worktree .vscode/launch.json
```

### 示例 폴더

`示例` 폴더는 삭제하지 마세요. AI가 내부 코드를 참고해야 합니다. 다만 `webpack.config.ts`의 약 54번째 줄에서 `{示例,src}/`를 `src/`로 바꿔 해당 폴더를 빌드 대상에서 제외할 수 있습니다.

#### jsdelivr로 프론트엔드 UI/스크립트 자동 업데이트 구현

작성한 프론트엔드 UI 또는 스크립트는 GitHub 저장소에서 빌드되므로, jsdelivr 링크로 접근할 수 있고, 이 링크를 UI/스크립트에서 직접 사용할 수 있습니다.

예를 들어, 다음과 같은 자동 업데이트 UI를 만들 수 있습니다.

```html
<body>
  <script>
    $('body').load('https://testingcf.jsdelivr.net/gh/lolo-desu/lolocard/dist/日记络络/界面/介绍页/index.html')
  </script>
</body>
```

또는 자동 업데이트 스크립트:

```typescript
import 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/酒馆助手/场景感/index.js'
```

자세한 내용은 [문서](https://stagedog.github.io/青空莉/工具经验/实时编写前端界面或脚本/进阶技巧)를 참고하세요.

### 자동 빌드/자동 업데이트 기능

이 저장소는 `.github/workflows` 폴더에 여러 CI 워크플로를 설정해 자동 빌드/자동 업데이트를 제공합니다. 웹 상단의 `Actions`에서 수동 실행도 가능합니다.

**`bundle.yaml`**

- `src` 폴더 코드를 `dist` 폴더로 자동 빌드하고, jsdelivr 캐시 갱신을 빠르게 하기 위해 버전을 자동 증가
- `tavern_sync.yaml`에 [미리 구성된 캐릭터 카드, 세계관 책, 프리셋](https://stagedog.github.io/青空莉/工具经验/实时编写角色卡、世界书或预设/)을 주점에서 가져올 수 있는 파일로 자동 패키징

**`bump_deps.yaml`**

- 3일마다 서드파티 라이브러리 의존성과 주점 도우미 `@types` 폴더를 자동 업데이트

**`sync_template.yaml`**

- 템플릿 저장소 기반으로 새 저장소를 만들면 템플릿 저장소와의 직접 연결이 끊기므로, 템플릿 업데이트(예: 코딩 도우미 규칙, MCP, `slash_command.txt` 파일 등)를 동기화하기 위한 워크플로
  - 템플릿 저장소 업데이트를 감지하면 동기화용 pull request를 자동 생성하며, **해당 pull request는 수동 승인해야 하므로 GitHub 메일 알림을 자주 확인하는 것을 권장**
  - 템플릿 저장소의 파일 중 더 이상 동기화하고 싶지 않은 파일은 `.github/.templatesyncignore`에 추가 가능

### 빌드 충돌 문제

자동 업데이트/빌드를 위해 이 프로젝트는 소스 일부를 `dist/` 폴더에 직접 빌드해 저장소에 함께 올립니다. 이로 인해 개발 중 브랜치 충돌이 자주 발생할 수 있습니다.

이를 해결하기 위해 저장소의 `.gitattribute`에서 `dist/` 폴더 충돌 시 항상 현재 버전을 사용하도록 설정했습니다. 업로드 후 CI가 `dist/`를 최신 버전으로 다시 빌드하므로, 업로드 시점의 `dist/` 내용은 중요하지 않습니다.

이 기능을 활성화하려면 아래 명령을 1회 실행하세요.

```bash
git config --global merge.ours.driver true
```

## 라이선스

[Aladdin](LICENSE)
