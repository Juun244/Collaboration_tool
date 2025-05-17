from flask import Flask
from flask_pymongo import PyMongo
from flask_login import LoginManager
from flask_bcrypt import Bcrypt
from flask_mail import Mail
from app.utils.mail import mail
from dotenv import load_dotenv
import os

from app.routes.auth import auth_bp, init_auth
from app.routes.projects import projects_bp, init_projects
from app.routes.cards import cards_bp, init_cards

# 환경 변수 로드
load_dotenv()

app = Flask(__name__)
app.config["MONGO_URI"] = f"mongodb://{os.getenv('DB_HOST')}:{os.getenv('DB_PORT')}/{os.getenv('DB_NAME')}"
app.secret_key = os.getenv('SECRET_KEY')

# 🔐 Flask-Mail 설정
app.config.update(
    MAIL_SERVER=os.getenv('MAIL_SERVER'),
    MAIL_PORT=int(os.getenv('MAIL_PORT', 587)),
    MAIL_USE_TLS=os.getenv('MAIL_USE_TLS', 'True') == 'True',
    MAIL_USERNAME=os.getenv('MAIL_USERNAME'),
    MAIL_PASSWORD=os.getenv('MAIL_PASSWORD'),
)

# 확장 기능 초기화
mongo = PyMongo(app)
bcrypt = Bcrypt(app)
mail.init_app(app)  # ✅ Flask-Mail 초기화 (Mail(app) ❌ 아님!)

# 로그인 매니저 초기화
login_manager = LoginManager()
login_manager.init_app(app)

# 사용자 모델
class User:
    def __init__(self, user_data):
        self.id = str(user_data["_id"])
        self.username = user_data.get("username", "NoName")
        self.invitations = user_data.get("invitations", [])

    def get_id(self):
        return self.id

    @property
    def is_active(self):
        return True

    @property
    def is_authenticated(self):
        return True

    @property
    def is_anonymous(self):
        return False

# 사용자 세션 로딩
@login_manager.user_loader
def load_user(user_id):
    from bson import ObjectId
    user_data = mongo.db.users.find_one({"_id": ObjectId(user_id)})
    return User(user_data) if user_data else None

# Blueprint 등록 및 초기화
init_auth(app)
init_projects(app)
init_cards(app)
app.register_blueprint(auth_bp)
app.register_blueprint(projects_bp)
app.register_blueprint(cards_bp)

if __name__ == "__main__":
    app.run(debug=True)
