import firebase_admin
from firebase_admin import credentials, messaging

_fcm_initialized = False


def init_fcm(credentials_path: str = ""):
    global _fcm_initialized
    if not _fcm_initialized and credentials_path:
        try:
            cred = credentials.Certificate(credentials_path)
            firebase_admin.initialize_app(cred)
            _fcm_initialized = True
        except Exception:
            pass


async def send_push_notification(
    token: str,
    title: str,
    body: str,
    channel_name: str = "",
    stream_id: int = 0,
):
    if not _fcm_initialized or not token:
        return
    try:
        message = messaging.Message(
            notification=messaging.Notification(title=title, body=body),
            data={
                "channel_name": channel_name,
                "stream_id": str(stream_id),
            },
            token=token,
        )
        messaging.send(message)
    except Exception:
        pass
