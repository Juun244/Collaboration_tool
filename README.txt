0. 프로젝트의 루트에 .env파일 생성 환경변수 입력

1. 가상환경 생성
python -m venv venv

2. 가상환경 활성화
venv\Scripts\activate
활성화시 터미널 앞에 (venv)가 표시됨
비활성화 하려면 터미널에 deactivate 입력

터미널 스크립트 실행 차단 시
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
입력하여 권한 부여

3.가상환경에 패키지 설치
pip install -r requirements.txt

4. 서버 실행
python -m app.main
