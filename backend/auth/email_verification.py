import asyncio
import os
import smtplib
from email.message import EmailMessage
from pathlib import Path

from dotenv import load_dotenv


BACKEND_ENV = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(dotenv_path=BACKEND_ENV)


def email_delivery_configured() -> bool:
    if not os.getenv("SMTP_USERNAME") or not os.getenv("SMTP_PASSWORD"):
        return False
    try:
        port = int(os.getenv("SMTP_PORT") or "465")
    except ValueError:
        return False
    username = os.getenv("SMTP_USERNAME")
    password = os.getenv("SMTP_PASSWORD")
    use_ssl = (os.getenv("SMTP_USE_SSL") or "true").lower() == "true"
    use_starttls = (os.getenv("SMTP_STARTTLS") or "false").lower() == "true"
    return (
        1 <= port <= 65535
        and bool(username) == bool(password)
        and (use_ssl or use_starttls)
    )


def _send_message(recipient: str, subject: str, body: str) -> None:
    host = os.getenv("SMTP_HOST") or "smtp.mail.ru"
    username = os.getenv("SMTP_USERNAME")
    sender = os.getenv("SMTP_FROM_EMAIL") or username
    if not sender:
        raise RuntimeError("SMTP_USERNAME or SMTP_FROM_EMAIL must be configured.")

    port = int(os.getenv("SMTP_PORT") or "465")
    password = os.getenv("SMTP_PASSWORD")
    use_ssl = (os.getenv("SMTP_USE_SSL") or "true").lower() == "true"
    use_starttls = (os.getenv("SMTP_STARTTLS") or "false").lower() == "true"
    if bool(username) != bool(password) or not (use_ssl or use_starttls):
        raise RuntimeError("SMTP authentication and TLS settings are incomplete.")

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = sender
    message["To"] = recipient
    message.set_content(body)

    client_class = smtplib.SMTP_SSL if use_ssl else smtplib.SMTP
    with client_class(host, port, timeout=10) as client:
        if use_starttls and not use_ssl:
            client.starttls()
        if username and password:
            client.login(username, password)
        client.send_message(message)


async def send_email(recipient: str, subject: str, body: str) -> None:
    await asyncio.to_thread(_send_message, recipient, subject, body)


async def send_verification_code(recipient: str, code: str) -> None:
    await send_email(
        recipient,
        "Код подтверждения CoolChess",
        f"Код подтверждения регистрации: {code}\n"
        "Он действует 10 минут. Если вы не регистрировались в CoolChess, "
        "просто проигнорируйте это письмо.",
    )
