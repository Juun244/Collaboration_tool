import eventlet
eventlet.monkey_patch()
import sys
import os

from app.main import app, socketio