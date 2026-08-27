"""Tests for the AWS scan connector."""

from src.app.services.connectors.aws_scan import (
    CATEGORY_PROMPTS,
    _build_inventory_prompt,
    _merge_active_services,
)

# ---------------------------------------------------------------------------
# _merge_active_services
# ---------------------------------------------------------------------------


def test_merge_active_services_deduplicates():
    """Cost Explorer names are normalised and merged with fixed services."""
    cost_services = {"Amazon Elastic Compute Cloud - Compute", "Amazon Simple Storage Service"}
    fixed_services = {"s3", "lambda", "iam"}
    result = _merge_active_services(cost_services, fixed_services)
    assert "s3" in result
    assert "ec2" in result
    assert "lambda" in result
    assert "iam" in result


def test_merge_active_services_empty_cost():
    """Fixed services are returned when Cost Explorer yields nothing."""
    result = _merge_active_services(set(), {"s3", "iam"})
    assert result == {"s3", "iam"}


def test_merge_active_services_empty_fixed():
    """Cost-only services are normalised and returned."""
    cost_services = {"AWS Lambda", "Amazon DynamoDB"}
    result = _merge_active_services(cost_services, set())
    assert "lambda" in result
    assert "dynamodb" in result


def test_merge_active_services_both_empty():
    result = _merge_active_services(set(), set())
    assert result == set()


def test_merge_active_services_unknown_cost_name_fallback():
    """Unknown cost names are lowered and stripped as a fallback key."""
    cost_services = {"Amazon SomeNewService"}
    result = _merge_active_services(cost_services, set())
    assert "somenewservice" in result


def test_merge_active_services_overlap_does_not_duplicate():
    """S3 from both Cost Explorer and fixed list should appear once."""
    cost_services = {"Amazon Simple Storage Service"}
    fixed_services = {"s3"}
    result = _merge_active_services(cost_services, fixed_services)
    assert result.count("s3") if isinstance(result, list) else list(result).count("s3") == 1


def test_merge_active_services_all_known_mappings():
    """All known Cost Explorer names should resolve to expected keys."""
    cost_services = {
        "Amazon Elastic Compute Cloud - Compute",
        "Amazon Simple Storage Service",
        "Amazon Relational Database Service",
        "AWS Lambda",
        "Amazon Elastic Container Service",
        "Amazon CloudFront",
        "AWS Identity and Access Management",
        "Amazon API Gateway",
        "Amazon Simple Queue Service",
        "Amazon Simple Notification Service",
        "Amazon DynamoDB",
        "AmazonCloudWatch",
    }
    result = _merge_active_services(cost_services, set())
    expected = {
        "ec2", "s3", "rds", "lambda", "ecs", "cloudfront",
        "iam", "apigateway", "sqs", "sns", "dynamodb", "cloudwatch",
    }
    assert expected.issubset(result)


# ---------------------------------------------------------------------------
# _build_inventory_prompt
# ---------------------------------------------------------------------------


def test_build_inventory_prompt_includes_data():
    """Prompt should contain serialised inventory data and region."""
    inventory = {
        "ec2": [{"InstanceId": "i-123", "InstanceType": "t3.micro", "State": {"Name": "running"}}],
    }
    prompt = _build_inventory_prompt("infrastructure", inventory, "us-east-1")
    assert "t3.micro" in prompt
    assert "running" in prompt
    assert "us-east-1" in prompt


def test_build_inventory_prompt_includes_category_instruction():
    inventory = {"s3": [{"Name": "my-bucket", "CreationDate": "2024-01-01"}]}
    prompt = _build_inventory_prompt("infrastructure", inventory, "eu-west-1")
    assert CATEGORY_PROMPTS["infrastructure"] in prompt


def test_build_inventory_prompt_truncates_long_data():
    """Service data longer than 15000 chars should be truncated."""
    big_data = [{"key": "x" * 20000}]
    inventory = {"big_service": big_data}
    prompt = _build_inventory_prompt("overview", inventory, "us-east-1")
    assert "... (truncated)" in prompt


def test_build_inventory_prompt_multiple_services():
    inventory = {
        "ec2": [{"InstanceId": "i-abc"}],
        "rds": [{"DBInstanceIdentifier": "mydb"}],
    }
    prompt = _build_inventory_prompt("services", inventory, "us-west-2")
    assert "ec2" in prompt
    assert "rds" in prompt
    assert "mydb" in prompt
    assert "us-west-2" in prompt


def test_build_inventory_prompt_empty_inventory():
    prompt = _build_inventory_prompt("overview", {}, "us-east-1")
    assert "us-east-1" in prompt
    assert CATEGORY_PROMPTS["overview"] in prompt


def test_build_inventory_prompt_unknown_category_falls_back_to_overview():
    inventory = {"ec2": []}
    prompt = _build_inventory_prompt("nonexistent_category", inventory, "ap-southeast-1")
    assert CATEGORY_PROMPTS["overview"] in prompt


def test_build_inventory_prompt_all_categories():
    """Every defined category should produce a prompt with its instruction."""
    inventory = {"iam": [{"RoleName": "admin-role"}]}
    for category, expected_text in CATEGORY_PROMPTS.items():
        prompt = _build_inventory_prompt(category, inventory, "us-east-1")
        assert expected_text in prompt, f"Category '{category}' instruction missing from prompt"
