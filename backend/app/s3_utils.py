"""
Handles uploading appointment attachments to AWS S3, and generating secure,
temporary download links for them.

AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, and AWS_S3_BUCKET are
read from the environment, which app/database.py already populates from
.env via python-dotenv when the app starts — same pattern as
RESEND_API_KEY in email_utils.py. boto3 (the AWS SDK) automatically picks
up the credential/region env vars by name, so we never pass them in code.

Why presigned URLs: the S3 bucket is kept PRIVATE (no public read access),
so nobody can guess or share a permanent link to a patient's file. Instead,
when someone with permission wants to download an attachment, the backend
asks AWS to generate a "presigned URL" — a normal S3 URL with a temporary
cryptographic signature attached, proving *our* secret key authorized it.
Anyone holding that URL can use it, but only for a few minutes (see
PRESIGNED_URL_EXPIRY_SECONDS below) and only for that one file — after it
expires, it stops working and a fresh one must be requested.
"""

import os
import uuid

import boto3
from botocore.exceptions import ClientError

AWS_REGION = os.getenv("AWS_REGION")
AWS_S3_BUCKET = os.getenv("AWS_S3_BUCKET")

# Only construct the S3 client if a bucket is actually configured, so the
# rest of the app can still start up (and every other feature keep working)
# even if S3 hasn't been set up yet — the same "optional, fails soft"
# approach as RESEND_API_KEY in email_utils.py.
_s3_client = boto3.client("s3", region_name=AWS_REGION) if AWS_S3_BUCKET else None

# Allow-list of attachment types this app accepts, mapped to the file
# extension we store them under. Checked against the browser-supplied
# Content-Type on upload (see routers/appointments.py).
ALLOWED_CONTENT_TYPES = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
}

MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB

PRESIGNED_URL_EXPIRY_SECONDS = 300  # 5 minutes


def _require_client() -> boto3.client:
    if _s3_client is None:
        raise RuntimeError(
            "S3 is not configured. Make sure a .env file exists in the "
            "project root with AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, "
            "AWS_SECRET_ACCESS_KEY, and AWS_REGION."
        )
    return _s3_client


def build_object_key(appointment_id: int, content_type: str) -> str:
    """
    Builds the S3 object key (the file's "path" inside the bucket) for a
    new attachment: appointments/<appointment_id>/<random-uuid>.<ext>.
    The appointment id groups files so they're easy to trace back to the
    record that owns them; the random UUID avoids filename collisions and
    means an object key can't be guessed from, say, a sequential id.
    """
    extension = ALLOWED_CONTENT_TYPES[content_type]
    return f"appointments/{appointment_id}/{uuid.uuid4()}.{extension}"


def upload_fileobj(file_obj, object_key: str, content_type: str) -> None:
    """Uploads a file-like object to the configured bucket under object_key."""
    client = _require_client()
    try:
        client.upload_fileobj(
            file_obj,
            AWS_S3_BUCKET,
            object_key,
            ExtraArgs={"ContentType": content_type},
        )
    except ClientError as e:
        raise RuntimeError(f"Failed to upload file to S3: {e}")


def generate_presigned_download_url(object_key: str) -> str:
    """Generates a time-limited signed URL for downloading one private object."""
    client = _require_client()
    try:
        return client.generate_presigned_url(
            "get_object",
            Params={"Bucket": AWS_S3_BUCKET, "Key": object_key},
            ExpiresIn=PRESIGNED_URL_EXPIRY_SECONDS,
        )
    except ClientError as e:
        raise RuntimeError(f"Failed to generate download link: {e}")
