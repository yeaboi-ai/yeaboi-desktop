"""GitHub API git operations — branches, commits, PRs. No local clone needed."""

import logging

from github import Auth, Github, GithubException, InputGitTreeElement

from ..config import get_settings

logger = logging.getLogger(__name__)


def _get_github_client() -> Github:
    settings = get_settings()
    if not settings.github_token:
        raise RuntimeError("GITHUB_TOKEN not configured")
    return Github(auth=Auth.Token(settings.github_token))


def _parse_repo_url(repo_url: str) -> str:
    """Extract 'owner/repo' from a GitHub URL."""
    url = repo_url.rstrip("/").removesuffix(".git")
    parts = url.split("github.com/")
    if len(parts) != 2:
        raise ValueError(f"Cannot parse GitHub repo from URL: {repo_url}")
    return parts[1]


def create_branch(repo_url: str, branch_name: str) -> str:
    """Create a new branch from main. Returns the branch ref."""
    g = _get_github_client()
    repo = g.get_repo(_parse_repo_url(repo_url))
    main_branch = repo.get_branch("main")
    base_sha = main_branch.commit.sha
    ref = repo.create_git_ref(f"refs/heads/{branch_name}", base_sha)
    logger.info("Created branch %s at %s", branch_name, base_sha[:8])
    return ref.ref


def commit_files(repo_url: str, branch_name: str, files: dict[str, str], message: str) -> str:
    """Commit multiple files to a branch. Returns commit SHA."""
    g = _get_github_client()
    repo = g.get_repo(_parse_repo_url(repo_url))
    ref = repo.get_git_ref(f"heads/{branch_name}")
    base_sha = ref.object.sha
    base_tree = repo.get_git_tree(base_sha)

    elements = [
        InputGitTreeElement(path=path, mode="100644", type="blob", content=content)
        for path, content in files.items()
        if content.strip()
    ]

    if not elements:
        logger.warning("No files to commit")
        return base_sha

    tree = repo.create_git_tree(elements, base_tree)
    commit = repo.create_git_commit(message, tree, [repo.get_git_commit(base_sha)])
    ref.edit(commit.sha)
    logger.info("Committed %d files to %s: %s", len(elements), branch_name, commit.sha[:8])
    return commit.sha


def open_pull_request(repo_url: str, branch_name: str, title: str, body: str) -> str:
    """Open a PR from branch_name → main. Returns the PR URL."""
    g = _get_github_client()
    repo = g.get_repo(_parse_repo_url(repo_url))

    try:
        pr = repo.create_pull(title=title, body=body, head=branch_name, base="main")
        logger.info("Opened PR #%d: %s", pr.number, pr.html_url)
        return pr.html_url
    except GithubException as e:
        if "pull request already exists" in str(e).lower():
            pulls = repo.get_pulls(state="open", head=f"{repo.owner.login}:{branch_name}")
            for pr in pulls:
                return pr.html_url
        raise


def merge_pull_request(repo_url: str, pr_url: str) -> bool:
    """Merge a PR by URL. Returns True if merged."""
    g = _get_github_client()
    repo = g.get_repo(_parse_repo_url(repo_url))
    pr_number = int(pr_url.rstrip("/").split("/")[-1])
    pr = repo.get_pull(pr_number)

    if pr.mergeable:
        pr.merge(merge_method="squash")
        logger.info("Merged PR #%d", pr_number)
        return True
    else:
        logger.warning("PR #%d is not mergeable", pr_number)
        return False


def update_branch_from_main(repo_url: str, branch_name: str) -> bool:
    """Update a branch to include latest main (merge main into branch). Returns True if updated."""
    g = _get_github_client()
    repo = g.get_repo(_parse_repo_url(repo_url))
    try:
        main_sha = repo.get_branch("main").commit.sha
        branch_ref = repo.get_git_ref(f"heads/{branch_name}")
        branch_sha = branch_ref.object.sha

        # Check if branch is already up to date
        comparison = repo.compare(main_sha, branch_sha)
        if comparison.behind_by == 0:
            return True  # already up to date

        # Merge main into the branch
        repo.merge(branch_name, main_sha, f"Merge main into {branch_name}")
        logger.info("Updated branch %s with latest main (%d commits behind)", branch_name, comparison.behind_by)
        return True
    except GithubException as e:
        if "merge conflict" in str(e).lower() or e.status == 409:
            logger.warning("Merge conflict updating %s from main", branch_name)
            return False
        logger.warning("Failed to update branch %s: %s", branch_name, e)
        return False


def rebase_open_prs(repo_url: str) -> dict[str, bool]:
    """Update all open agent PR branches with latest main. Returns {branch: success}."""
    g = _get_github_client()
    repo = g.get_repo(_parse_repo_url(repo_url))
    results = {}
    for pr in repo.get_pulls(state="open"):
        if pr.head.ref.startswith("agent/"):
            results[pr.head.ref] = update_branch_from_main(repo_url, pr.head.ref)
    if results:
        logger.info(
            "Rebased %d agent branches: %s", len(results), {k: "ok" if v else "conflict" for k, v in results.items()}
        )
    return results


def get_repo_tree(repo_url: str, max_files: int = 50) -> str:
    """Get a summary of the repo structure for context."""
    g = _get_github_client()
    repo = g.get_repo(_parse_repo_url(repo_url))
    try:
        tree = repo.get_git_tree("main", recursive=True)
        paths = [item.path for item in tree.tree[:max_files] if item.type == "blob"]
        return "\n".join(paths)
    except Exception:
        return ""


def get_file_content(repo_url: str, path: str, branch: str = "main") -> str | None:
    """Read a single file from the repo."""
    g = _get_github_client()
    repo = g.get_repo(_parse_repo_url(repo_url))
    try:
        content = repo.get_contents(path, ref=branch)
        if isinstance(content, list):
            return None
        return content.decoded_content.decode()
    except Exception:
        return None
