from itsdangerous import URLSafeTimedSerializer, SignatureExpired
from flask import Blueprint, render_template, request, redirect, url_for, session, flash
from flask_login import login_user, logout_user, login_required, current_user
from flask_pymongo import PyMongo
from flask_bcrypt import Bcrypt
from flask_mail import Message
from app.utils.mail import mail
from app.utils.helpers import logger
from bson import ObjectId
from authlib.integrations.flask_client import OAuth
import os
import re
from datetime import datetime
from datetime import datetime, date


oauth = None
serializer = None
auth_bp = Blueprint('auth', __name__)

def init_auth(app):
    global mongo, bcrypt, oauth, serializer
    mongo = PyMongo(app)
    bcrypt = Bcrypt(app)
    oauth = OAuth(app)
    serializer = URLSafeTimedSerializer(app.secret_key)

    # Google OAuth
    oauth.register(
        name='google',
        client_id=os.environ.get("GOOGLE_CLIENT_ID"),
        client_secret=os.environ.get("GOOGLE_CLIENT_SECRET"),
        access_token_url='https://oauth2.googleapis.com/token',
        authorize_url='https://accounts.google.com/o/oauth2/auth',
        api_base_url='https://www.googleapis.com/oauth2/v1/',
        client_kwargs={'scope': 'email profile'}
    )

    # Kakao OAuth
    oauth.register(
        name='kakao',
        client_id=os.environ.get("KAKAO_REST_API_KEY"),
        access_token_url='https://kauth.kakao.com/oauth/token',
        authorize_url='https://kauth.kakao.com/oauth/authorize',
        api_base_url='https://kapi.kakao.com/v2/user/me',
        client_kwargs={'scope': 'profile_nickname profile_image'}
    )

@auth_bp.route("/")
def home():
    if current_user.is_authenticated:
        return redirect(url_for("auth.dashboard"))
    return redirect(url_for("auth.login"))

# 회원가입
@auth_bp.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        username = request.form["username"]
        nickname = request.form["nickname"].strip()
        password = request.form["password"]
        confirm_password = request.form["confirm_password"]
        hashed_password = bcrypt.generate_password_hash(password).decode("utf-8")

        # 이메일 유효성 검사
        email_regex = r"^[\w\.-]+@[\w\.-]+\.\w+$"
        if not re.match(email_regex, username):
            flash("유효한 이메일 주소를 입력하세요.", "danger")
            return redirect(url_for("auth.register"))

        # 닉네임 중복 확인
        if mongo.db.users.find_one({"username": nickname}):
            flash("이미 사용 중인 닉네임입니다. 다른 닉네임을 입력해주세요.", "warning")
            return redirect(url_for("auth.register"))

        # 비밀번호 유효성 검사
        if len(password) < 8 or not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
            flash("비밀번호는 8자 이상이며, 특수문자를 1개 이상 포함해야 합니다.", "danger")
            return redirect(url_for("auth.register"))

        if password != confirm_password:
            flash("비밀번호가 일치하지 않습니다.", "danger")
            return redirect(url_for("auth.register"))

        # 기존 이메일 중복 확인
        if mongo.db.users.find_one({"email": username}):
            existing_user = mongo.db.users.find_one({"email": username})
            if existing_user.get("is_verified", True):
                flash("이미 등록된 사용자입니다. 로그인을 시도해주세요.", "danger")
                return redirect(url_for("auth.login"))
            else:
                flash("이미 등록된 이메일입니다. 이메일 인증 후 로그인해주세요.", "warning")
                return redirect(url_for("auth.resend_verification", email=username))

        # 이메일 인증 토큰 생성
        token = serializer.dumps(username, salt='email-confirm')
        verify_link = url_for('auth.confirm_email', token=token, _external=True)

        msg = Message(
            subject="회원가입 이메일 인증",
            sender=os.environ.get("MAIL_USERNAME"),
            recipients=[username],
            body=f"[CollabTool] 아래 링크를 클릭해 이메일 인증을 완료해주세요:\n\n{verify_link}\n\n이 링크는 1시간 동안만 유효합니다."
        )
        mail.send(msg)

        # 사용자 저장
        mongo.db.users.insert_one({
            "email": username,
            "username": nickname,  # 닉네임을 username으로 저장
            "password": hashed_password,
            "auth_type": "local",
            "invitations": [],
            "is_verified": False
        })

        flash("회원가입 완료! 입력하신 이메일에서 인증을 완료해주세요.", "success")
        return redirect(url_for("auth.login"))

    return render_template("register.html")


# 회원가입 이메일 인증
@auth_bp.route("/verify/<token>")
def confirm_email(token):
    try:
        email = serializer.loads(token, salt="email-confirm", max_age=3600)
    except SignatureExpired:
        flash("인증 링크가 만료되었습니다. 재인증이 필요합니다.", "danger")
        return redirect(url_for("auth.resend_verification"))

    user = mongo.db.users.find_one({"email": email})  # 수정된 부분
    if user:
        mongo.db.users.update_one({"email": email}, {"$set": {"is_verified": True}})  # 수정된 부분
        flash("이메일 인증이 완료되었습니다 ✅", "success")
    else:
        flash("해당 이메일로 가입된 사용자를 찾을 수 없습니다.", "warning")
    return redirect(url_for("auth.login"))


# 이메일 재인증
@auth_bp.route("/resend-verification", methods=["GET", "POST"])
def resend_verification():
    if request.method == "POST":
        email = request.form["email"]
        user = mongo.db.users.find_one({"email": email})
        if user and not user.get("is_verified", False):
            token = serializer.dumps(email, salt="email-confirm")
            confirm_url = url_for("auth.confirm_email", token=token, _external=True)
            msg = Message(
                subject="이메일 인증 다시 받기",
                sender=os.environ.get("MAIL_USERNAME"),
                recipients=[email]
            )
            msg.body = f"다시 인증하려면 아래 링크를 클릭하세요:\n\n{confirm_url}"
            mail.send(msg)

            flash("인증 이메일이 재전송되었습니다 📩", "info")
            return redirect(url_for("auth.login"))
        else:
            flash("이메일이 이미 인증되었거나 존재하지 않습니다.", "warning")
    return render_template("resend_verification.html")

# 로그인
@auth_bp.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form.get("username")
        password = request.form.get("password")
        remember = request.form.get("remember") == "on"
        user_data = mongo.db.users.find_one({"email": username})

        if not user_data:
            flash("존재하지 않는 사용자입니다.", "danger")
            return redirect(url_for("auth.login"))
        if user_data.get("is_verified", False) and bcrypt.check_password_hash(user_data["password"], password):
            flash("이메일 인증이 완료되지 않았습니다. 회원가입 시 받은 이메일을 확인하거나 다시 등록해주세요.", "warning")
            return redirect(url_for("auth.resend_verification", email=username))
        if not bcrypt.check_password_hash(user_data["password"], password):
            flash("비밀번호가 틀렸습니다.", "danger")
            return redirect(url_for("auth.login"))

        from app.__main__ import User
        user = User(user_data)
        login_user(user, remember=remember)
        session["user_id"] = user.id
        return redirect(url_for("auth.dashboard"))

    return render_template("login.html")

# 비밀번호 재설정
@auth_bp.route("/forgot", methods=["GET", "POST"])
def forgot_password():
    if request.method == "POST":
        email = request.form.get("email")
        user = mongo.db.users.find_one({"username": email})
        if not user:
            flash("등록되지 않은 이메일입니다.", "danger")
            return redirect(url_for("auth.forgot_password"))

        token = serializer.dumps(email, salt='reset-password')
        reset_link = url_for('auth.reset_password', token=token, _external=True)

        msg = Message("[CollabTool] 비밀번호 재설정 링크",
                      sender=os.environ.get("MAIL_USERNAME"),
                      recipients=[email],
                      body=f"아래 링크를 클릭하여 비밀번호를 재설정하세요 (1시간 유효):\n{reset_link}")
        mail.send(msg)

        flash("비밀번호 재설정 링크가 이메일로 전송되었습니다.", "info")
        return redirect(url_for("auth.login"))

    return render_template("forgot_password.html")

# 비밀번호 재설정 토큰
@auth_bp.route("/reset/<token>", methods=["GET", "POST"])
def reset_password(token):
    try:
        email = serializer.loads(token, salt='reset-password', max_age=3600)
    except Exception:
        return "유효하지 않거나 만료된 토큰입니다."

    if request.method == "POST":
        new_password = request.form.get("new_password")
        confirm_password = request.form.get("confirm_password")

        # None일 경우를 대비한 기본값 처리
        new_password = new_password.strip() if new_password else ""
        confirm_password = confirm_password.strip() if confirm_password else ""

        if not new_password or not confirm_password:
            flash("모든 필드를 입력해주세요.", "danger")
            return redirect(request.url)

        if len(new_password) < 8 or not re.search(r"[!@#$%^&*(),.?\":{}|<>]", new_password):
            flash("비밀번호는 8자 이상이며, 특수문자를 포함해야 합니다.", "danger")
            return redirect(request.url)

        if new_password != confirm_password:
            flash("비밀번호가 일치하지 않습니다.", "danger")
            return redirect(request.url)

        hashed = bcrypt.generate_password_hash(new_password).decode("utf-8")
        mongo.db.users.update_one({"email": email}, {"$set": {"password": hashed}})
        flash("비밀번호가 성공적으로 변경되었습니다.", "success")
        return redirect(url_for("auth.login"))

    return render_template("reset_password.html", token=token)


# 로그아웃
@auth_bp.route("/logout")
@login_required
def logout():
    logout_user()
    session.pop("user_id", None)
    return redirect(url_for("auth.login"))

# 대시보드
@auth_bp.route("/dashboard")
@login_required
def dashboard():

    print("auth.py dashboard route executed")


    user_data = mongo.db.users.find_one({"_id": ObjectId(current_user.id)})
    projects = mongo.db.projects.find({"members": ObjectId(current_user.id)}).sort("order", 1)

    project_list = []
    for project in projects:
        project["owner"] = str(project.get("owner", None))

        deadline = project.get("deadline", None)
        if deadline and isinstance(deadline, datetime):
            project["deadline"] = deadline.strftime("%Y-%m-%d")

            today = date.today()
            delta_days = (deadline.date() - today).days
            if delta_days > 0:
                project["d_day"] = f"D-{delta_days}"
            elif delta_days == 0:
                project["d_day"] = "D-Day"
            else:
                project["d_day"] = f"D+{abs(delta_days)}"
        else:
            project["d_day"] = None

        card_count = mongo.db.cards.count_documents({"project_id": project["_id"]})
        project["card_count"] = card_count
        project_list.append(project)

    return render_template(
        "dashboard.html",
        user={"_id": str(current_user.id), "username": current_user.username},
        projects=project_list,
        today=date.today().isoformat()
    )

# 소셜 로그인 시작
@auth_bp.route("/login/<provider>")
def oauth_login(provider):
    remember = request.args.get('remember') == '1'
    session['remember'] = remember
    redirect_uri = url_for("auth.oauth_callback", provider=provider, _external=True)
    return oauth.create_client(provider).authorize_redirect(redirect_uri)

# 소셜 로그인 콜백
@auth_bp.route("/callback/<provider>")
def oauth_callback(provider):
    client = oauth.create_client(provider)
    token = client.authorize_access_token()

    if provider == "google":
        resp = client.get("userinfo")
    elif provider == "kakao":
        resp = client.get("https://kapi.kakao.com/v2/user/me")

    user_info = resp.json()

    if provider == "google":
        username = user_info.get("email")
    elif provider == "kakao":
        kakao_id = str(user_info.get("id"))
        kakao_account = user_info.get("kakao_account", {})
        profile = kakao_account.get("profile", {})
        nickname = profile.get("nickname", "KakaoUser")
        username = f"{nickname}_{kakao_id}"

    user_data = mongo.db.users.find_one({"email": username})
    if not user_data:
        session["temp_user_info"] = {
            "email": username,
            "auth_type": provider
        }
        return redirect(url_for("auth.set_nickname"))

    from app.__main__ import User
    user = User(user_data)
    remember = session.get('remember', False)
    login_user(user, remember=remember)
    session["user_id"] = user.id
    session.pop('remember', None)
    return redirect(url_for("auth.dashboard"))


@auth_bp.route("/set-nickname", methods=["GET", "POST"])
def set_nickname():
    from app.__main__ import User

    if request.method == "POST":
        nickname = request.form["nickname"].strip()
        info = session.get("temp_user_info")

        if not info:
            flash("잘못된 접근입니다.", "danger")
            return redirect(url_for("auth.login"))

        if mongo.db.users.find_one({"username": nickname}):
            flash("이미 사용 중인 닉네임입니다. 다른 닉네임을 입력해주세요.", "warning")
            return redirect(url_for("auth.set_nickname"))

        # ✅ 중복이 아닐 경우, 새 유저 생성 및 로그인
        new_user = {
            "email": info["email"],
            "username": nickname,
            "auth_type": info["auth_type"],
            "invitations": []
        }
        result = mongo.db.users.insert_one(new_user)
        new_user["_id"] = result.inserted_id

        login_user(User(new_user))
        session.pop("temp_user_info", None)

        return redirect(url_for("auth.dashboard"))

    return render_template("set_nickname.html")



@auth_bp.route("/check-nickname", methods=["POST"])
def check_nickname():
    nickname = request.json.get("nickname", "").strip()
    exists = mongo.db.users.find_one({"username": nickname}) is not None
    return {"exists": exists}
