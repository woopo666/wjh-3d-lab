# WJH 3D Lab 사용법

여러 AI 모델의 입력·결과를 비교하고 보정·리깅·검수하는 독립 제작 실험실입니다. 게임 서버 설치는 필요하지 않습니다.

```powershell
git clone https://github.com/woopo666/wjh-3d-lab.git
cd wjh-3d-lab
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
npm ci
npx playwright install chromium
npm run studio
```

실행 정책 변경 없이 Python 실행 파일을 직접 사용합니다. 다른 터미널에서 예제를 실행하세요.

```powershell
.venv/Scripts/python.exe examples/make_sample.py
.venv/Scripts/python.exe pipeline.py init Calibration --reference jobs/sample-input/front.png --model jobs/sample-input/source.glb --category prop --morphology static --surface native
.venv/Scripts/python.exe pipeline.py run Calibration
```

`http://127.0.0.1:5208/jobs/Calibration/review/index.html`에서 결과를 봅니다. 이 예제는 UV 확인용 도형이며 AI 생성 예제가 아닙니다.

## 내 캐릭터

원화는 투명 PNG, 모델은 정면 +Z / 위 +Y, 중립 자세로 준비합니다. 원본 정면 투사는 단일 primitive, UV/법선, base-color와 metallic/roughness 텍스처가 필요합니다.

```powershell
.venv/Scripts/python.exe pipeline.py init Hero --reference C:/assets/front.png --model C:/assets/tl2.glb --geometry trellis2 --morphology humanoid --style stylized
.venv/Scripts/python.exe pipeline.py run Hero
.venv/Scripts/python.exe pipeline.py native Hero --blender C:/tools/blender/blender.exe
```

원화와 정면·양측면·후면·걷기·달리기·공격·방어·죽음·기어가기 결과를 보고 판단합니다. 확인 후:

```powershell
.venv/Scripts/python.exe pipeline.py approve Hero --reviewer "검토자" --notes "얼굴, 후면, 관절과 동작 확인"
.venv/Scripts/python.exe pipeline.py export Hero
```

`dist/`에 GLB와 Blender 파일, 설정, 검토 기록이 담긴 ZIP이 생성됩니다. 원본이나 설정이 바뀌면 다시 검토해야 합니다.

## 모델 및 보정 선택

- `--geometry`: trellis2, trellis1, hunyuan3d-2.1. 각 모델의 별도 Linux CUDA 환경 필요. [설정](PROVIDERS.md).
- `--surface reference-front`: 기존 TL2 형상 + 원본 이미지 투사 방식.
- `--surface native`: 생성 표면 유지.
- `--surface tl1-transfer --donor aligned.glb --allow-experimental`: 정렬된 TL1 등 다른 메시의 색상을 이식하는 새 실험 기능. 자동 정렬·눈/입 의미 대응까지 해결하는 기능은 아닙니다.
- 무기/환경/소품: `--morphology static --surface native`.
- 조류·뱀의 애니메이션 리깅은 미구현이므로 차단합니다.

캐릭터별 해부학 설정은 `--config profile.json`으로 지정합니다. 어떤 모델이든 완벽하게 처리한다고 가정하지 말고 결과와 [검증 범위](VALIDATION.md)를 확인하세요.


## Checkpoint downloads

Missing weights download automatically from official model repositories on generation. Existing local weights are reused. Install `huggingface_hub` in the provider Python environment. For cached-only execution: `python pipeline.py generate JOB_ID --offline`. See [provider settings](PROVIDERS.md#automatic-checkpoint-downloads).
