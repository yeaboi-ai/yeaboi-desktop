"""Tests for the secret filter service."""

from src.app.services.secret_filter import redact_secrets, should_skip_file

# ─── should_skip_file ─────────────────────────────────────────────────────────


def test_skip_env_file():
    assert should_skip_file(".env") is True
    assert should_skip_file(".env.local") is True
    assert should_skip_file(".env.production") is True
    assert should_skip_file(".env.development") is True
    assert should_skip_file(".env.staging") is True
    assert should_skip_file(".env.test") is True
    assert should_skip_file(".env.example") is True


def test_skip_key_files():
    assert should_skip_file("server.pem") is True
    assert should_skip_file("id_rsa.key") is True
    assert should_skip_file("keystore.p12") is True
    assert should_skip_file("keystore.pfx") is True
    assert should_skip_file("keystore.jks") is True
    assert should_skip_file("app.keystore") is True
    assert should_skip_file("cert.crt") is True


def test_skip_credential_files():
    assert should_skip_file("credentials.json") is True
    assert should_skip_file("secrets.yaml") is True
    assert should_skip_file("secrets.yml") is True
    assert should_skip_file("vault.json") is True


def test_allow_normal_files():
    assert should_skip_file("package.json") is False
    assert should_skip_file("main.py") is False
    assert should_skip_file("README.md") is False
    assert should_skip_file("Dockerfile") is False
    assert should_skip_file("config.py") is False
    assert should_skip_file("settings.json") is False
    assert should_skip_file("app.ts") is False


# ─── redact_secrets ───────────────────────────────────────────────────────────


def test_redact_aws_keys():
    content = "export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\nexport AWS_SECRET=something"
    result = redact_secrets(content)
    assert "AKIAIOSFODNN7EXAMPLE" not in result
    assert "[REDACTED_AWS_KEY]" in result


def test_redact_private_key_block():
    content = "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA1234567890abcdef\n-----END RSA PRIVATE KEY-----\n"
    result = redact_secrets(content)
    assert "MIIEowIBAAKCAQEA" not in result
    assert "[REDACTED_PRIVATE_KEY]" in result


def test_redact_generic_secrets():
    lines = [
        'password="supersecret"',
        "api_key=sk-ant-api03-supersecretkey",
        "secret: my-top-secret-value",
        'access_token="eyJhbGciOiJIUzI1NiJ9"',
    ]
    content = "\n".join(lines)
    result = redact_secrets(content)
    assert "supersecret" not in result
    assert "[REDACTED]" in result


def test_redact_jwt():
    # A realistic three-segment JWT
    jwt_token = (
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
    )
    content = f"Authorization: Bearer {jwt_token}"
    result = redact_secrets(content)
    assert jwt_token not in result
    assert "[REDACTED" in result


def test_redact_anthropic_api_key():
    content = "ANTHROPIC_KEY=sk-ant-api03-abc123def456ghi789jkl012mno345pqr678stu901vwx234yz"
    result = redact_secrets(content)
    assert "sk-ant-api03" not in result
    assert "[REDACTED" in result


def test_redact_openai_api_key():
    content = "OPENAI_KEY=sk-abcdefghijklmnopqrstuvwxyz12345678"
    result = redact_secrets(content)
    assert "sk-abcdefghijklmnopqrstuvwxyz12345678" not in result
    assert "[REDACTED_API_KEY]" in result


def test_redact_connection_strings():
    lines = [
        "MONGO_URI=mongodb://admin:p@ssw0rd@localhost:27017/mydb",
        "PG_URL=postgres://user:hunter2@db.example.com:5432/app",
        "REDIS_URL=redis://default:secretpass@redis.example.com:6379",
    ]
    content = "\n".join(lines)
    result = redact_secrets(content)
    assert "p@ssw0rd" not in result
    assert "hunter2" not in result
    assert "secretpass" not in result
    assert "[REDACTED]@" in result


def test_redact_bearer_token():
    content = "curl -H 'Authorization: Bearer abc123.def456.ghi789'"
    result = redact_secrets(content)
    assert "abc123.def456.ghi789" not in result
    assert "Bearer [REDACTED]" in result


def test_no_false_positives_on_clean_content():
    content = "def main():\n    print('Hello, world!')\n    return 0\n"
    result = redact_secrets(content)
    assert result == content


def test_heavily_redacted_returns_empty():
    """When >50% of lines contain secrets, is_mostly_secrets should be True."""
    lines = [
        "password=secret1",
        "api_key=secret2",
        "secret=secret3",
        "access_token=secret4",
        "private_key=secret5",
        "auth_token=secret6",
    ]
    content = "\n".join(lines)
    _, is_mostly_secrets = redact_secrets(content, return_flag=True)
    assert is_mostly_secrets is True


def test_sparse_secrets_not_flagged():
    """When <50% of lines contain secrets, is_mostly_secrets should be False."""
    content = "import os\nimport sys\npassword=secret\ndef run():\n    pass\n"
    _, is_mostly_secrets = redact_secrets(content, return_flag=True)
    assert is_mostly_secrets is False


def test_return_flag_false_returns_string():
    content = "password=secret"
    result = redact_secrets(content, return_flag=False)
    assert isinstance(result, str)
    assert not isinstance(result, tuple)


def test_return_flag_true_returns_tuple():
    content = "password=secret"
    result = redact_secrets(content, return_flag=True)
    assert isinstance(result, tuple)
    assert len(result) == 2
