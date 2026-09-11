-- The planning schema as it stood at revision k2l3m4n5o6p7, the last one
-- before projects were removed. Captured from that revision's models with
-- create_all, because the historical alembic chain cannot replay on SQLite
-- (pre-batch_alter_table revisions use ALTER-constraint operations).
--
-- This is a snapshot of the past: it describes a schema that will never
-- change again, and exists so tests/test_migrations.py can build a real
-- pre-collapse database to upgrade.

CREATE TABLE app_settings (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36) NOT NULL, 
	"key" VARCHAR(100) NOT NULL, 
	value TEXT NOT NULL, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_app_settings_user_key UNIQUE (user_id, "key"), 
	FOREIGN KEY(user_id) REFERENCES users (id)
);
CREATE TABLE audit_logs (
	id VARCHAR(36) NOT NULL, 
	org_id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36) NOT NULL, 
	action VARCHAR(100) NOT NULL, 
	resource_type VARCHAR(50) NOT NULL, 
	resource_id VARCHAR(36), 
	metadata JSON NOT NULL, 
	ip_address VARCHAR(45), 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(org_id) REFERENCES organizations (id), 
	FOREIGN KEY(user_id) REFERENCES users (id)
);
CREATE TABLE blueprint_iterations (
	id VARCHAR(36) NOT NULL, 
	project_id VARCHAR(36) NOT NULL, 
	org_id VARCHAR(36), 
	iteration_number INTEGER NOT NULL, 
	label VARCHAR(50) NOT NULL, 
	display_name VARCHAR(100), 
	status VARCHAR(20) NOT NULL, 
	locked_at DATETIME, 
	locked_by VARCHAR(36), 
	forked_from_id VARCHAR(36), 
	iteration_type VARCHAR(30), 
	parent_out_of_scope TEXT, 
	removed_bullets JSON, 
	share_token VARCHAR(64), 
	share_enabled BOOLEAN NOT NULL, 
	yeaboi_session_id VARCHAR(64), 
	plan_generated_at DATETIME, 
	plan_source_snapshot_id VARCHAR(36), 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(project_id) REFERENCES projects (id), 
	FOREIGN KEY(org_id) REFERENCES organizations (id), 
	FOREIGN KEY(locked_by) REFERENCES users (id), 
	FOREIGN KEY(forked_from_id) REFERENCES blueprint_iterations (id)
);
CREATE TABLE blueprint_personas (
	id VARCHAR(36) NOT NULL, 
	org_id VARCHAR(36) NOT NULL, 
	slug VARCHAR(50) NOT NULL, 
	name VARCHAR(100) NOT NULL, 
	description TEXT, 
	system_prompt TEXT NOT NULL, 
	focus_sections JSON NOT NULL, 
	is_system BOOLEAN NOT NULL, 
	sort_order INTEGER NOT NULL, 
	deleted_at DATETIME, 
	avatar_url VARCHAR(500), 
	video_avatar_id VARCHAR(36), 
	voice_id VARCHAR(100), 
	speed FLOAT, 
	emotion VARCHAR(20), 
	language VARCHAR(10), 
	realtime_voice VARCHAR(30), 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(org_id) REFERENCES organizations (id), 
	FOREIGN KEY(video_avatar_id) REFERENCES video_avatars (id) ON DELETE SET NULL
);
CREATE TABLE blueprint_sections_registry (
	id VARCHAR(36) NOT NULL, 
	org_id VARCHAR(36) NOT NULL, 
	slug VARCHAR(50) NOT NULL, 
	label VARCHAR(100) NOT NULL, 
	description TEXT, 
	is_system BOOLEAN NOT NULL, 
	sort_order INTEGER NOT NULL, 
	deleted_at DATETIME, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(org_id) REFERENCES organizations (id)
);
CREATE TABLE blueprint_snapshots (
	id VARCHAR(36) NOT NULL, 
	project_id VARCHAR(36) NOT NULL, 
	org_id VARCHAR(36), 
	iteration_id VARCHAR(36), 
	version_number INTEGER NOT NULL, 
	content JSON NOT NULL, 
	created_by VARCHAR(36) NOT NULL, 
	session_id VARCHAR(36), 
	section_sources JSON, 
	bullet_sources JSON, 
	diff_from_previous JSON, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(project_id) REFERENCES projects (id), 
	FOREIGN KEY(org_id) REFERENCES organizations (id), 
	FOREIGN KEY(iteration_id) REFERENCES blueprint_iterations (id), 
	FOREIGN KEY(session_id) REFERENCES sessions (id) ON DELETE SET NULL
);
CREATE TABLE blueprint_suggestions (
	id VARCHAR(36) NOT NULL, 
	project_id VARCHAR(36) NOT NULL, 
	session_id VARCHAR(36), 
	section VARCHAR(50) NOT NULL, 
	content TEXT NOT NULL, 
	edited_content TEXT, 
	status VARCHAR(20) NOT NULL, 
	reviewed_at DATETIME, 
	reviewed_by VARCHAR(36), 
	source_message_ids JSON, 
	supersedes_bullet TEXT, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(project_id) REFERENCES projects (id), 
	FOREIGN KEY(session_id) REFERENCES sessions (id) ON DELETE SET NULL, 
	FOREIGN KEY(reviewed_by) REFERENCES users (id)
);
CREATE TABLE blueprint_templates (
	id VARCHAR(36) NOT NULL, 
	org_id VARCHAR(36) NOT NULL, 
	slug VARCHAR(50) NOT NULL, 
	name VARCHAR(100) NOT NULL, 
	description TEXT, 
	icon VARCHAR(30) NOT NULL, 
	sections JSON NOT NULL, 
	default_persona_id VARCHAR(36), 
	is_system BOOLEAN NOT NULL, 
	sort_order INTEGER NOT NULL, 
	deleted_at DATETIME, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(org_id) REFERENCES organizations (id), 
	FOREIGN KEY(default_persona_id) REFERENCES blueprint_personas (id) ON DELETE SET NULL
);
CREATE TABLE board_columns (
	id VARCHAR(36) NOT NULL, 
	board_id VARCHAR(36) NOT NULL, 
	name VARCHAR(100) NOT NULL, 
	position INTEGER NOT NULL, 
	wip_limit INTEGER, 
	is_start_state BOOLEAN DEFAULT 'false' NOT NULL, 
	is_done_state BOOLEAN DEFAULT 'false' NOT NULL, 
	agent_trigger_state BOOLEAN DEFAULT 'false' NOT NULL, 
	agent_review_state BOOLEAN DEFAULT 'false' NOT NULL, 
	accent_color VARCHAR(7), 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(board_id) REFERENCES boards (id)
);
CREATE TABLE boards (
	id VARCHAR(36) NOT NULL, 
	project_id VARCHAR(36) NOT NULL, 
	org_id VARCHAR(36) NOT NULL, 
	iteration_id VARCHAR(36), 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(project_id) REFERENCES projects (id), 
	FOREIGN KEY(org_id) REFERENCES organizations (id), 
	FOREIGN KEY(iteration_id) REFERENCES blueprint_iterations (id)
);
CREATE TABLE card_attachments (
	id VARCHAR(36) NOT NULL, 
	card_id VARCHAR(36) NOT NULL, 
	uploaded_by VARCHAR(36) NOT NULL, 
	filename VARCHAR(255) NOT NULL, 
	storage_key VARCHAR(500) NOT NULL, 
	mime_type VARCHAR(100) NOT NULL, 
	size_bytes INTEGER NOT NULL, 
	extracted_text TEXT, 
	width INTEGER, 
	height INTEGER, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(card_id) REFERENCES cards (id) ON DELETE CASCADE, 
	FOREIGN KEY(uploaded_by) REFERENCES users (id)
);
CREATE TABLE card_comments (
	id VARCHAR(36) NOT NULL, 
	card_id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36) NOT NULL, 
	content TEXT NOT NULL, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(card_id) REFERENCES cards (id) ON DELETE CASCADE, 
	FOREIGN KEY(user_id) REFERENCES users (id)
);
CREATE TABLE card_events (
	id VARCHAR(36) NOT NULL, 
	card_id VARCHAR(36) NOT NULL, 
	actor_id VARCHAR(36), 
	kind VARCHAR(30) NOT NULL, 
	payload JSON DEFAULT '{}' NOT NULL, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(card_id) REFERENCES cards (id) ON DELETE CASCADE, 
	FOREIGN KEY(actor_id) REFERENCES users (id)
);
CREATE TABLE card_external_links (
	id VARCHAR(36) NOT NULL, 
	card_id VARCHAR(36) NOT NULL, 
	org_id VARCHAR(36) NOT NULL, 
	integration_id VARCHAR(36) NOT NULL, 
	provider VARCHAR(20) NOT NULL, 
	external_id VARCHAR(64) NOT NULL, 
	external_key VARCHAR(64), 
	external_url VARCHAR(500), 
	last_synced_at DATETIME, 
	last_local_change_at DATETIME, 
	last_remote_change_at DATETIME, 
	sync_state VARCHAR(16) DEFAULT 'pending' NOT NULL, 
	last_error TEXT, 
	retry_count INTEGER DEFAULT '0' NOT NULL, 
	version_token VARCHAR(64), 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_card_external_links_card_provider UNIQUE (card_id, provider), 
	FOREIGN KEY(card_id) REFERENCES cards (id) ON DELETE CASCADE, 
	FOREIGN KEY(org_id) REFERENCES organizations (id), 
	FOREIGN KEY(integration_id) REFERENCES org_integrations (id) ON DELETE CASCADE
);
CREATE TABLE card_links (
	id VARCHAR(36) NOT NULL, 
	source_card_id VARCHAR(36) NOT NULL, 
	target_card_id VARCHAR(36) NOT NULL, 
	link_type VARCHAR(20) NOT NULL, 
	created_by VARCHAR(36) NOT NULL, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_card_link_triple UNIQUE (source_card_id, target_card_id, link_type), 
	CONSTRAINT ck_card_link_no_self CHECK (source_card_id <> target_card_id), 
	FOREIGN KEY(source_card_id) REFERENCES cards (id) ON DELETE CASCADE, 
	FOREIGN KEY(target_card_id) REFERENCES cards (id) ON DELETE CASCADE, 
	FOREIGN KEY(created_by) REFERENCES users (id)
);
CREATE TABLE card_views (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36) NOT NULL, 
	org_id VARCHAR(36) NOT NULL, 
	name VARCHAR(120) NOT NULL, 
	"query" TEXT DEFAULT '' NOT NULL, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
	FOREIGN KEY(org_id) REFERENCES organizations (id) ON DELETE CASCADE
);
CREATE TABLE cards (
	id VARCHAR(36) NOT NULL, 
	column_id VARCHAR(36) NOT NULL, 
	position INTEGER NOT NULL, 
	title VARCHAR(255) NOT NULL, 
	description TEXT, 
	priority VARCHAR(20), 
	story_points INTEGER, 
	assignee_id VARCHAR(36), 
	labels JSON NOT NULL, 
	acceptance_criteria JSON NOT NULL, 
	parent_card_id VARCHAR(36), 
	depends_on JSON NOT NULL, 
	related_to JSON NOT NULL, 
	wave INTEGER, 
	sequence INTEGER, 
	auto_approve BOOLEAN DEFAULT 'false' NOT NULL, 
	agent_status VARCHAR(20), 
	agent_pr_url VARCHAR(500), 
	agent_branch VARCHAR(255), 
	agent_log JSON NOT NULL, 
	session_id VARCHAR(36), 
	project_id VARCHAR(36), 
	number INTEGER, 
	friendly_id VARCHAR(20), 
	template_id VARCHAR(36), 
	template_version INTEGER, 
	custom_fields JSON DEFAULT '{}' NOT NULL, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_cards_project_number UNIQUE (project_id, number), 
	FOREIGN KEY(column_id) REFERENCES board_columns (id), 
	FOREIGN KEY(assignee_id) REFERENCES users (id), 
	FOREIGN KEY(parent_card_id) REFERENCES cards (id), 
	FOREIGN KEY(session_id) REFERENCES sessions (id), 
	FOREIGN KEY(project_id) REFERENCES projects (id), 
	FOREIGN KEY(template_id) REFERENCES ticket_templates (id) ON DELETE SET NULL
);
CREATE TABLE character_video_previews (
	id VARCHAR(36) NOT NULL, 
	cache_key VARCHAR(64) NOT NULL, 
	character_id VARCHAR(36) NOT NULL, 
	persona_name VARCHAR(120) NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	tavus_video_id VARCHAR(64), 
	video_url VARCHAR(1024), 
	error_message TEXT, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(character_id) REFERENCES video_avatars (id) ON DELETE CASCADE
);
CREATE TABLE chat_messages (
	id VARCHAR(36) NOT NULL, 
	session_id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36), 
	content TEXT NOT NULL, 
	message_type VARCHAR(20) NOT NULL, 
	speaker_name VARCHAR(255), 
	audio_url VARCHAR(500), 
	attachments JSON, 
	original_content TEXT, 
	is_enhanced BOOLEAN NOT NULL, 
	reactions JSON, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(session_id) REFERENCES sessions (id), 
	FOREIGN KEY(user_id) REFERENCES users (id)
);
CREATE TABLE directory_entries (
	id VARCHAR(36) NOT NULL, 
	team_id VARCHAR(36) NOT NULL, 
	parent_id VARCHAR(36), 
	path VARCHAR(500) NOT NULL, 
	title VARCHAR(255) NOT NULL, 
	content TEXT NOT NULL, 
	description VARCHAR(500), 
	category VARCHAR(50) NOT NULL, 
	source VARCHAR(50) NOT NULL, 
	scan_status VARCHAR(20), 
	content_hash VARCHAR(64), 
	integration_id VARCHAR(36), 
	source_ref VARCHAR(500), 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_directory_team_path UNIQUE (team_id, path), 
	FOREIGN KEY(team_id) REFERENCES teams (id) ON DELETE CASCADE, 
	FOREIGN KEY(parent_id) REFERENCES directory_entries (id) ON DELETE SET NULL, 
	FOREIGN KEY(integration_id) REFERENCES org_integrations (id) ON DELETE SET NULL
);
CREATE TABLE feedback (
	id VARCHAR(36) NOT NULL, 
	org_id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36) NOT NULL, 
	session_id VARCHAR(36), 
	target_type VARCHAR(30) NOT NULL, 
	target_id VARCHAR(36), 
	agent_type VARCHAR(20) NOT NULL, 
	rating VARCHAR(20) NOT NULL, 
	comment TEXT, 
	context JSON, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_feedback_user_target UNIQUE (user_id, target_type, target_id), 
	FOREIGN KEY(org_id) REFERENCES organizations (id), 
	FOREIGN KEY(user_id) REFERENCES users (id), 
	FOREIGN KEY(session_id) REFERENCES sessions (id)
);
CREATE TABLE generation_granularities (
	id VARCHAR(36) NOT NULL, 
	org_id VARCHAR(36) NOT NULL, 
	slug VARCHAR(64) NOT NULL, 
	label VARCHAR(64) NOT NULL, 
	blurb TEXT, 
	prompt_fragment TEXT DEFAULT '' NOT NULL, 
	sort_order INTEGER DEFAULT '0' NOT NULL, 
	is_system BOOLEAN DEFAULT 'false' NOT NULL, 
	deleted_at DATETIME, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(org_id) REFERENCES organizations (id)
);
CREATE TABLE generation_modifiers (
	id VARCHAR(36) NOT NULL, 
	org_id VARCHAR(36) NOT NULL, 
	slug VARCHAR(64) NOT NULL, 
	label VARCHAR(64) NOT NULL, 
	blurb TEXT, 
	category VARCHAR(20) DEFAULT 'shape' NOT NULL, 
	prompt_fragment TEXT DEFAULT '' NOT NULL, 
	sort_order INTEGER DEFAULT '0' NOT NULL, 
	is_system BOOLEAN DEFAULT 'false' NOT NULL, 
	deleted_at DATETIME, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(org_id) REFERENCES organizations (id)
);
CREATE TABLE generation_presets (
	id VARCHAR(36) NOT NULL, 
	org_id VARCHAR(36) NOT NULL, 
	slug VARCHAR(64) NOT NULL, 
	label VARCHAR(64) NOT NULL, 
	blurb TEXT, 
	icon VARCHAR(40) DEFAULT 'Layers' NOT NULL, 
	granularity VARCHAR(32) DEFAULT 'balanced' NOT NULL, 
	modifiers JSON DEFAULT '[]' NOT NULL, 
	sort_order INTEGER DEFAULT '0' NOT NULL, 
	is_system BOOLEAN DEFAULT 'false' NOT NULL, 
	deleted_at DATETIME, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(org_id) REFERENCES organizations (id)
);
CREATE TABLE harness_configs (
	id VARCHAR(36) NOT NULL, 
	project_id VARCHAR(36) NOT NULL, 
	org_id VARCHAR(36), 
	repo_name VARCHAR(255), 
	repo_url VARCHAR(500), 
	repo_provider VARCHAR(20) NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	generation_log JSON, 
	template_overrides JSON NOT NULL, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (project_id), 
	FOREIGN KEY(project_id) REFERENCES projects (id), 
	FOREIGN KEY(org_id) REFERENCES organizations (id)
);
CREATE TABLE integration_project_mappings (
	id VARCHAR(36) NOT NULL, 
	integration_id VARCHAR(36) NOT NULL, 
	internal_project_id VARCHAR(36) NOT NULL, 
	external_project_key VARCHAR(120) NOT NULL, 
	external_project_id VARCHAR(64), 
	default_issue_type VARCHAR(40) DEFAULT 'Task' NOT NULL, 
	field_mappings JSON DEFAULT '{}' NOT NULL, 
	sync_direction VARCHAR(16) DEFAULT 'bidirectional' NOT NULL, 
	enabled BOOLEAN DEFAULT 'true' NOT NULL, 
	webhook_secret_encrypted TEXT, 
	webhook_external_id VARCHAR(120), 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_integration_project_mappings_integration_project UNIQUE (integration_id, internal_project_id), 
	FOREIGN KEY(integration_id) REFERENCES org_integrations (id) ON DELETE CASCADE, 
	FOREIGN KEY(internal_project_id) REFERENCES projects (id) ON DELETE CASCADE
);
CREATE TABLE integration_scan_items (
	id VARCHAR(36) NOT NULL, 
	scan_log_id VARCHAR(36) NOT NULL, 
	resource_path VARCHAR(500) NOT NULL, 
	action VARCHAR(20) NOT NULL, 
	ai_model_used VARCHAR(50), 
	tokens_used INTEGER, 
	directory_entry_id VARCHAR(36), 
	reason TEXT, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(scan_log_id) REFERENCES integration_scan_logs (id) ON DELETE CASCADE, 
	FOREIGN KEY(directory_entry_id) REFERENCES directory_entries (id) ON DELETE SET NULL
);
CREATE TABLE integration_scan_logs (
	id VARCHAR(36) NOT NULL, 
	integration_id VARCHAR(36) NOT NULL, 
	scan_type VARCHAR(20) NOT NULL, 
	status VARCHAR(20) DEFAULT 'running' NOT NULL, 
	started_at DATETIME NOT NULL, 
	completed_at DATETIME, 
	resources_scanned INTEGER DEFAULT '0' NOT NULL, 
	entries_created INTEGER DEFAULT '0' NOT NULL, 
	entries_updated INTEGER DEFAULT '0' NOT NULL, 
	ai_calls_made INTEGER DEFAULT '0' NOT NULL, 
	ai_tokens_used INTEGER DEFAULT '0' NOT NULL, 
	error_message TEXT, 
	details TEXT, 
	PRIMARY KEY (id), 
	FOREIGN KEY(integration_id) REFERENCES org_integrations (id) ON DELETE CASCADE
);
CREATE TABLE niko_conversations (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36) NOT NULL, 
	org_id VARCHAR(36) NOT NULL, 
	title VARCHAR(255), 
	is_archived BOOLEAN NOT NULL, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id), 
	FOREIGN KEY(org_id) REFERENCES organizations (id)
);
CREATE TABLE niko_messages (
	id VARCHAR(36) NOT NULL, 
	conversation_id VARCHAR(36) NOT NULL, 
	role VARCHAR(20) NOT NULL, 
	content TEXT, 
	tool_calls JSON, 
	tool_results JSON, 
	context_snapshot JSON, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(conversation_id) REFERENCES niko_conversations (id) ON DELETE CASCADE
);
CREATE TABLE notifications (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36) NOT NULL, 
	org_id VARCHAR(36), 
	project_id VARCHAR(36), 
	title VARCHAR(255) NOT NULL, 
	body TEXT, 
	type VARCHAR(50) NOT NULL, 
	read BOOLEAN NOT NULL, 
	link VARCHAR(500), 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id), 
	FOREIGN KEY(org_id) REFERENCES organizations (id), 
	FOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE
);
CREATE TABLE org_ai_config (
	id VARCHAR(36) NOT NULL, 
	org_id VARCHAR(36) NOT NULL, 
	provider VARCHAR(50) NOT NULL, 
	byok_provider VARCHAR(50), 
	byok_api_key TEXT, 
	byok_default_model VARCHAR(100), 
	byok_fast_model VARCHAR(100), 
	bedrock_role_arn VARCHAR(255), 
	bedrock_region VARCHAR(20), 
	bedrock_model VARCHAR(100), 
	bedrock_fast_model VARCHAR(100), 
	self_hosted_url VARCHAR(500), 
	self_hosted_model VARCHAR(100), 
	self_hosted_fast_model VARCHAR(100), 
	flow_model VARCHAR(100), 
	arch_model VARCHAR(100), 
	wireframe_model VARCHAR(100), 
	wireframe_critic_model VARCHAR(100), 
	monthly_spend_soft_limit_usd NUMERIC(10, 2), 
	monthly_spend_hard_limit_usd NUMERIC(10, 2), 
	spend_alert_email VARCHAR(255), 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (org_id), 
	FOREIGN KEY(org_id) REFERENCES organizations (id) ON DELETE CASCADE
);
CREATE TABLE org_ai_defaults (
	id VARCHAR(36) NOT NULL, 
	org_id VARCHAR(36) NOT NULL, 
	voice_id VARCHAR(100), 
	speed FLOAT, 
	emotion VARCHAR(20), 
	language VARCHAR(10), 
	realtime_voice VARCHAR(30), 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (org_id), 
	FOREIGN KEY(org_id) REFERENCES organizations (id) ON DELETE CASCADE
);
CREATE TABLE org_brands (
	id VARCHAR(36) NOT NULL, 
	org_id VARCHAR(36) NOT NULL, 
	name VARCHAR(100) NOT NULL, 
	is_active BOOLEAN DEFAULT 'false' NOT NULL, 
	app_name VARCHAR(100), 
	tagline VARCHAR(200), 
	logo_url VARCHAR(500), 
	favicon_url VARCHAR(500), 
	source_url VARCHAR(500), 
	theme_id VARCHAR(64), 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(org_id) REFERENCES organizations (id) ON DELETE CASCADE
);
CREATE TABLE org_integrations (
	id VARCHAR(36) NOT NULL, 
	org_id VARCHAR(36) NOT NULL, 
	provider VARCHAR(50) NOT NULL, 
	category VARCHAR(30) NOT NULL, 
	auth_type VARCHAR(20) NOT NULL, 
	status VARCHAR(20) DEFAULT 'pending' NOT NULL, 
	access_token TEXT, 
	refresh_token TEXT, 
	token_expires_at DATETIME, 
	credentials TEXT, 
	scopes TEXT DEFAULT '[]' NOT NULL, 
	metadata TEXT, 
	connected_by VARCHAR(36) NOT NULL, 
	last_scan_at DATETIME, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_org_integration_provider UNIQUE (org_id, provider), 
	FOREIGN KEY(org_id) REFERENCES organizations (id) ON DELETE CASCADE, 
	FOREIGN KEY(connected_by) REFERENCES users (id)
);
CREATE TABLE org_members (
	id VARCHAR(36) NOT NULL, 
	org_id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36) NOT NULL, 
	role VARCHAR(20) DEFAULT 'member' NOT NULL, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(org_id) REFERENCES organizations (id), 
	FOREIGN KEY(user_id) REFERENCES users (id)
);
CREATE TABLE org_spend_alerts_sent (
	id VARCHAR(36) NOT NULL, 
	org_id VARCHAR(36) NOT NULL, 
	year_month VARCHAR(7) NOT NULL, 
	threshold INTEGER NOT NULL, 
	sent_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(org_id) REFERENCES organizations (id) ON DELETE CASCADE
);
CREATE TABLE org_themes (
	id VARCHAR(36) NOT NULL, 
	org_id VARCHAR(36) NOT NULL, 
	theme_id VARCHAR(64) NOT NULL, 
	auto_light_dark JSON, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (org_id), 
	FOREIGN KEY(org_id) REFERENCES organizations (id) ON DELETE CASCADE
);
CREATE TABLE organizations (
	id VARCHAR(36) NOT NULL, 
	name VARCHAR(255) NOT NULL, 
	slug VARCHAR(100) NOT NULL, 
	"plan" VARCHAR(50) DEFAULT 'free' NOT NULL, 
	billing_email VARCHAR(255), 
	deleted_at DATETIME, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (slug)
);
CREATE TABLE participants (
	id VARCHAR(36) NOT NULL, 
	session_id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36) NOT NULL, 
	role VARCHAR(20) NOT NULL, 
	recording_consent BOOLEAN, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(session_id) REFERENCES sessions (id), 
	FOREIGN KEY(user_id) REFERENCES users (id)
);
CREATE TABLE pricing_overrides (
	id VARCHAR(36) NOT NULL, 
	org_id VARCHAR(36), 
	provider VARCHAR(32) NOT NULL, 
	operation VARCHAR(32) NOT NULL, 
	model VARCHAR(128), 
	unit VARCHAR(40) NOT NULL, 
	price_usd NUMERIC(14, 8) NOT NULL, 
	effective_from DATETIME, 
	effective_until DATETIME, 
	note VARCHAR(500), 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(org_id) REFERENCES organizations (id)
);
CREATE TABLE project_attachments (
	id VARCHAR(36) NOT NULL, 
	project_id VARCHAR(36) NOT NULL, 
	uploaded_by VARCHAR(36) NOT NULL, 
	filename VARCHAR(255) NOT NULL, 
	storage_key VARCHAR(500) NOT NULL, 
	mime_type VARCHAR(100) NOT NULL, 
	size_bytes INTEGER NOT NULL, 
	width INTEGER, 
	height INTEGER, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE, 
	FOREIGN KEY(uploaded_by) REFERENCES users (id)
);
CREATE TABLE project_outputs (
	id VARCHAR(36) NOT NULL, 
	project_id VARCHAR(36) NOT NULL, 
	output_type VARCHAR(30) NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	payload JSON, 
	artifacts JSON, 
	error TEXT, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_project_outputs_type UNIQUE (project_id, output_type), 
	FOREIGN KEY(project_id) REFERENCES projects (id)
);
CREATE TABLE projects (
	id VARCHAR(36) NOT NULL, 
	name VARCHAR(255) NOT NULL, 
	description TEXT, 
	repo_url VARCHAR(500), 
	owner_id VARCHAR(36) NOT NULL, 
	org_id VARCHAR(36) NOT NULL, 
	team_id VARCHAR(36) NOT NULL, 
	deleted_at DATETIME, 
	"key" VARCHAR(10), 
	card_counter INTEGER DEFAULT '0' NOT NULL, 
	is_demo BOOLEAN DEFAULT 'false' NOT NULL, 
	default_generation_style VARCHAR(32), 
	default_modifiers JSON DEFAULT '[]' NOT NULL, 
	reference_links JSON DEFAULT '[]' NOT NULL, 
	yeaboi_project_id VARCHAR(64), 
	status VARCHAR(20) DEFAULT 'active' NOT NULL, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_projects_org_key UNIQUE (org_id, "key"), 
	FOREIGN KEY(owner_id) REFERENCES users (id), 
	FOREIGN KEY(org_id) REFERENCES organizations (id), 
	FOREIGN KEY(team_id) REFERENCES teams (id)
);
CREATE TABLE recordings (
	id VARCHAR(36) NOT NULL, 
	session_id VARCHAR(36) NOT NULL, 
	started_by_id VARCHAR(36), 
	egress_id VARCHAR(128) NOT NULL, 
	room_name VARCHAR(255) NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	file_url VARCHAR(1024), 
	duration_seconds INTEGER, 
	file_size_bytes BIGINT, 
	error VARCHAR(500), 
	started_at DATETIME, 
	ended_at DATETIME, 
	expires_at DATETIME NOT NULL, 
	share_token VARCHAR(24), 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(session_id) REFERENCES sessions (id) ON DELETE CASCADE, 
	FOREIGN KEY(started_by_id) REFERENCES users (id), 
	UNIQUE (egress_id), 
	UNIQUE (share_token)
);
CREATE TABLE repo_analysis_jobs (
	id VARCHAR(36) NOT NULL, 
	project_id VARCHAR(36) NOT NULL, 
	org_id VARCHAR(36) NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	repo_full_name VARCHAR(255), 
	profile_json JSON, 
	error TEXT, 
	started_at DATETIME NOT NULL, 
	completed_at DATETIME, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE, 
	FOREIGN KEY(org_id) REFERENCES organizations (id)
);
CREATE TABLE report_subscriptions (
	id VARCHAR(36) NOT NULL, 
	org_id VARCHAR(36) NOT NULL, 
	owner_user_id VARCHAR(36) NOT NULL, 
	name VARCHAR(255) NOT NULL, 
	scope_kind VARCHAR(20) NOT NULL, 
	scope_id VARCHAR(36), 
	filters JSON, 
	frequency VARCHAR(20) NOT NULL, 
	schedule_config JSON NOT NULL, 
	channels JSON NOT NULL, 
	formats JSON NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	last_run_at DATETIME, 
	next_run_at DATETIME, 
	deleted_at DATETIME, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(org_id) REFERENCES organizations (id), 
	FOREIGN KEY(owner_user_id) REFERENCES users (id)
);
CREATE TABLE session_clips (
	id VARCHAR(36) NOT NULL, 
	session_id VARCHAR(36) NOT NULL, 
	created_by_id VARCHAR(36) NOT NULL, 
	share_token VARCHAR(24) NOT NULL, 
	title VARCHAR(255), 
	transcript JSON NOT NULL, 
	start_ts DATETIME, 
	end_ts DATETIME, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(session_id) REFERENCES sessions (id) ON DELETE CASCADE, 
	FOREIGN KEY(created_by_id) REFERENCES users (id), 
	UNIQUE (share_token)
);
CREATE TABLE session_context (
	id VARCHAR(36) NOT NULL, 
	session_id VARCHAR(36) NOT NULL, 
	directory JSON NOT NULL, 
	summary TEXT, 
	summary_through_event_id VARCHAR(36), 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_session_context_session_id UNIQUE (session_id), 
	FOREIGN KEY(session_id) REFERENCES sessions (id), 
	FOREIGN KEY(summary_through_event_id) REFERENCES session_events (id)
);
CREATE TABLE session_events (
	id VARCHAR(36) NOT NULL, 
	session_id VARCHAR(36) NOT NULL, 
	event_type VARCHAR(30) NOT NULL, 
	source VARCHAR(20) NOT NULL, 
	payload JSON NOT NULL, 
	summary VARCHAR(500), 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(session_id) REFERENCES sessions (id)
);
CREATE TABLE sessions (
	id VARCHAR(36) NOT NULL, 
	project_id VARCHAR(36) NOT NULL, 
	org_id VARCHAR(36) NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	title VARCHAR(255), 
	initial_idea TEXT, 
	join_code VARCHAR(12) NOT NULL, 
	ai_config JSON NOT NULL, 
	iteration_id VARCHAR(36), 
	diagram_state JSON, 
	canvas_elements JSON, 
	focus_sections JSON, 
	focus_target JSON, 
	agent_runtime_state JSON, 
	session_extraction JSON, 
	blueprint_review_status VARCHAR(20) NOT NULL, 
	blueprint_review_completed_at DATETIME, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(project_id) REFERENCES projects (id), 
	FOREIGN KEY(org_id) REFERENCES organizations (id), 
	UNIQUE (join_code), 
	FOREIGN KEY(iteration_id) REFERENCES blueprint_iterations (id)
);
CREATE TABLE slack_event_dedup (
	event_id VARCHAR(64) NOT NULL, 
	slack_team_id VARCHAR(64), 
	event_type VARCHAR(64), 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (event_id)
);
CREATE TABLE slack_session_announcements (
	id VARCHAR(36) NOT NULL, 
	session_id VARCHAR(36) NOT NULL, 
	org_id VARCHAR(36) NOT NULL, 
	channel_id VARCHAR(64) NOT NULL, 
	message_ts VARCHAR(64) NOT NULL, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(session_id) REFERENCES sessions (id) ON DELETE CASCADE
);
CREATE TABLE slack_user_links (
	id VARCHAR(36) NOT NULL, 
	slack_team_id VARCHAR(64) NOT NULL, 
	slack_user_id VARCHAR(64) NOT NULL, 
	user_id VARCHAR(36) NOT NULL, 
	verified_via VARCHAR(32) NOT NULL, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_slack_user_link UNIQUE (slack_team_id, slack_user_id), 
	FOREIGN KEY(user_id) REFERENCES users (id)
);
CREATE TABLE status_components (
	id VARCHAR(36) NOT NULL, 
	"key" VARCHAR(64) NOT NULL, 
	name VARCHAR(120) NOT NULL, 
	"group" VARCHAR(20) NOT NULL, 
	description VARCHAR(500), 
	display_order INTEGER DEFAULT '0' NOT NULL, 
	active BOOLEAN DEFAULT 'true' NOT NULL, 
	internal_probe_key VARCHAR(255), 
	third_party_status_url VARCHAR(500), 
	upstream_status_url VARCHAR(500), 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE ("key")
);
CREATE TABLE status_incident_components (
	incident_id VARCHAR(36) NOT NULL, 
	component_id VARCHAR(36) NOT NULL, 
	impact VARCHAR(20) NOT NULL, 
	PRIMARY KEY (incident_id, component_id), 
	FOREIGN KEY(incident_id) REFERENCES status_incidents (id) ON DELETE CASCADE, 
	FOREIGN KEY(component_id) REFERENCES status_components (id) ON DELETE CASCADE
);
CREATE TABLE status_incident_updates (
	id VARCHAR(36) NOT NULL, 
	incident_id VARCHAR(36) NOT NULL, 
	body TEXT NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	posted_at DATETIME NOT NULL, 
	posted_by_user_id VARCHAR(36), 
	PRIMARY KEY (id), 
	FOREIGN KEY(incident_id) REFERENCES status_incidents (id) ON DELETE CASCADE, 
	FOREIGN KEY(posted_by_user_id) REFERENCES users (id)
);
CREATE TABLE status_incidents (
	id VARCHAR(36) NOT NULL, 
	title VARCHAR(255) NOT NULL, 
	body TEXT, 
	severity VARCHAR(20) NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	started_at DATETIME NOT NULL, 
	resolved_at DATETIME, 
	posted_by_user_id VARCHAR(36), 
	auto_detected BOOLEAN DEFAULT 'false' NOT NULL, 
	external_key VARCHAR(255), 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(posted_by_user_id) REFERENCES users (id), 
	UNIQUE (external_key)
);
CREATE TABLE status_maintenance (
	id VARCHAR(36) NOT NULL, 
	title VARCHAR(255) NOT NULL, 
	body TEXT, 
	scheduled_start DATETIME NOT NULL, 
	scheduled_end DATETIME NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	posted_by_user_id VARCHAR(36), 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(posted_by_user_id) REFERENCES users (id)
);
CREATE TABLE status_maintenance_components (
	maintenance_id VARCHAR(36) NOT NULL, 
	component_id VARCHAR(36) NOT NULL, 
	PRIMARY KEY (maintenance_id, component_id), 
	FOREIGN KEY(maintenance_id) REFERENCES status_maintenance (id) ON DELETE CASCADE, 
	FOREIGN KEY(component_id) REFERENCES status_components (id) ON DELETE CASCADE
);
CREATE TABLE status_probe_daily (
	component_id VARCHAR(36) NOT NULL, 
	day DATE NOT NULL, 
	worst_status SMALLINT NOT NULL, 
	uptime_pct FLOAT NOT NULL, 
	sample_count INTEGER NOT NULL, 
	PRIMARY KEY (component_id, day), 
	FOREIGN KEY(component_id) REFERENCES status_components (id) ON DELETE CASCADE
);
CREATE TABLE status_probes (
	id INTEGER NOT NULL, 
	component_id VARCHAR(36) NOT NULL, 
	ts DATETIME NOT NULL, 
	status SMALLINT NOT NULL, 
	latency_ms INTEGER, 
	error VARCHAR(64), 
	PRIMARY KEY (id), 
	FOREIGN KEY(component_id) REFERENCES status_components (id) ON DELETE CASCADE
);
CREATE TABLE subscription_runs (
	id VARCHAR(36) NOT NULL, 
	subscription_id VARCHAR(36) NOT NULL, 
	started_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	finished_at DATETIME, 
	status VARCHAR(20) NOT NULL, 
	error VARCHAR(2000), 
	deliveries JSON, 
	PRIMARY KEY (id), 
	FOREIGN KEY(subscription_id) REFERENCES report_subscriptions (id)
);
CREATE TABLE sync_events (
	id VARCHAR(36) NOT NULL, 
	card_id VARCHAR(36), 
	link_id VARCHAR(36), 
	direction VARCHAR(8) NOT NULL, 
	action VARCHAR(20) NOT NULL, 
	status VARCHAR(16) NOT NULL, 
	request_id VARCHAR(60), 
	payload JSON, 
	error TEXT, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(card_id) REFERENCES cards (id) ON DELETE CASCADE, 
	FOREIGN KEY(link_id) REFERENCES card_external_links (id) ON DELETE CASCADE
);
CREATE TABLE task_generation_jobs (
	id VARCHAR(36) NOT NULL, 
	project_id VARCHAR(36) NOT NULL, 
	session_id VARCHAR(36) NOT NULL, 
	org_id VARCHAR(36) NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	current_wave INTEGER NOT NULL, 
	waves_complete INTEGER NOT NULL, 
	partial_tasks JSON NOT NULL, 
	templates_payload JSON, 
	feedback_context JSON, 
	style VARCHAR(32) DEFAULT 'balanced' NOT NULL, 
	modifiers JSON DEFAULT '[]' NOT NULL, 
	repo_profile_json JSON, 
	error TEXT, 
	started_at DATETIME NOT NULL, 
	finished_at DATETIME, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(project_id) REFERENCES projects (id) ON DELETE CASCADE, 
	FOREIGN KEY(session_id) REFERENCES sessions (id) ON DELETE CASCADE, 
	FOREIGN KEY(org_id) REFERENCES organizations (id)
);
CREATE TABLE team_members (
	id VARCHAR(36) NOT NULL, 
	team_id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36) NOT NULL, 
	role VARCHAR(20) DEFAULT 'member' NOT NULL, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(team_id) REFERENCES teams (id), 
	FOREIGN KEY(user_id) REFERENCES users (id)
);
CREATE TABLE team_slack_channels (
	id VARCHAR(36) NOT NULL, 
	team_id VARCHAR(36) NOT NULL, 
	slack_channel_id VARCHAR(64) NOT NULL, 
	slack_channel_name VARCHAR(255), 
	event_types JSON NOT NULL, 
	created_by VARCHAR(36) NOT NULL, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_team_slack_channel UNIQUE (team_id, slack_channel_id), 
	FOREIGN KEY(team_id) REFERENCES teams (id) ON DELETE CASCADE, 
	FOREIGN KEY(created_by) REFERENCES users (id)
);
CREATE TABLE teams (
	id VARCHAR(36) NOT NULL, 
	org_id VARCHAR(36) NOT NULL, 
	name VARCHAR(255) NOT NULL, 
	slug VARCHAR(100) NOT NULL, 
	description TEXT, 
	deleted_at DATETIME, 
	last_viewed_project_id VARCHAR(36), 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(org_id) REFERENCES organizations (id), 
	FOREIGN KEY(last_viewed_project_id) REFERENCES projects (id) ON DELETE SET NULL
);
CREATE TABLE theme_presets (
	id VARCHAR(36) NOT NULL, 
	name VARCHAR(100) NOT NULL, 
	scope VARCHAR(10) NOT NULL, 
	owner_user_id VARCHAR(36), 
	org_id VARCHAR(36), 
	base_preset VARCHAR(64), 
	color_scheme VARCHAR(10) NOT NULL, 
	tokens JSON NOT NULL, 
	version INTEGER NOT NULL, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT ck_theme_presets_scope_ownership CHECK ((scope = 'user' AND owner_user_id IS NOT NULL AND org_id IS NULL) OR (scope = 'org' AND org_id IS NOT NULL AND owner_user_id IS NULL)), 
	FOREIGN KEY(owner_user_id) REFERENCES users (id) ON DELETE CASCADE, 
	FOREIGN KEY(org_id) REFERENCES organizations (id) ON DELETE CASCADE
);
CREATE TABLE ticket_templates (
	id VARCHAR(36) NOT NULL, 
	org_id VARCHAR(36) NOT NULL, 
	project_id VARCHAR(36), 
	slug VARCHAR(60) NOT NULL, 
	name VARCHAR(100) NOT NULL, 
	description TEXT, 
	icon VARCHAR(30) DEFAULT 'zap' NOT NULL, 
	default_priority VARCHAR(20), 
	default_story_points INTEGER, 
	default_labels JSON DEFAULT '[]' NOT NULL, 
	prompt_fragment TEXT DEFAULT '' NOT NULL, 
	field_schema JSON DEFAULT '[]' NOT NULL, 
	field_layout JSON DEFAULT '[]' NOT NULL, 
	acceptance_criteria_template JSON DEFAULT '[]' NOT NULL, 
	applicability JSON DEFAULT '{}' NOT NULL, 
	is_system BOOLEAN DEFAULT 'false' NOT NULL, 
	version INTEGER DEFAULT '1' NOT NULL, 
	sort_order INTEGER DEFAULT '0' NOT NULL, 
	deleted_at DATETIME, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_ticket_templates_scope_slug UNIQUE (org_id, project_id, slug, deleted_at), 
	FOREIGN KEY(org_id) REFERENCES organizations (id), 
	FOREIGN KEY(project_id) REFERENCES projects (id)
);
CREATE TABLE transcript_entries (
	id VARCHAR(36) NOT NULL, 
	session_id VARCHAR(36) NOT NULL, 
	speaker_id VARCHAR(36), 
	speaker_name VARCHAR(255), 
	text TEXT NOT NULL, 
	original_text TEXT, 
	is_final BOOLEAN NOT NULL, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(session_id) REFERENCES sessions (id), 
	FOREIGN KEY(speaker_id) REFERENCES users (id)
);
CREATE TABLE transcription_corrections (
	id VARCHAR(36) NOT NULL, 
	org_id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36) NOT NULL, 
	session_id VARCHAR(36), 
	message_id VARCHAR(36), 
	original_text TEXT NOT NULL, 
	corrected_text TEXT NOT NULL, 
	corrections_json JSON, 
	auto_detected BOOLEAN NOT NULL, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(org_id) REFERENCES organizations (id), 
	FOREIGN KEY(user_id) REFERENCES users (id), 
	FOREIGN KEY(session_id) REFERENCES sessions (id), 
	FOREIGN KEY(message_id) REFERENCES chat_messages (id)
);
CREATE TABLE usage_events (
	id VARCHAR(36) NOT NULL, 
	org_id VARCHAR(36) NOT NULL, 
	project_id VARCHAR(36), 
	session_id VARCHAR(36), 
	provider VARCHAR(32) NOT NULL, 
	operation VARCHAR(32) NOT NULL, 
	model VARCHAR(128), 
	units JSON NOT NULL, 
	cost_usd NUMERIC(12, 6) NOT NULL, 
	is_estimated BOOLEAN NOT NULL, 
	source VARCHAR(20) NOT NULL, 
	occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	metadata JSON, 
	PRIMARY KEY (id), 
	FOREIGN KEY(org_id) REFERENCES organizations (id), 
	FOREIGN KEY(project_id) REFERENCES projects (id), 
	FOREIGN KEY(session_id) REFERENCES sessions (id)
);
CREATE TABLE user_theme_preferences (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36) NOT NULL, 
	mode VARCHAR(20) NOT NULL, 
	theme_id VARCHAR(64), 
	auto_light_id VARCHAR(64), 
	auto_dark_id VARCHAR(64), 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (user_id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE TABLE users (
	id VARCHAR(36) NOT NULL, 
	email VARCHAR(255) NOT NULL, 
	name VARCHAR(255), 
	avatar_url VARCHAR(500), 
	display_name VARCHAR(100), 
	invite_token VARCHAR(36), 
	invite_claimed BOOLEAN DEFAULT 'true' NOT NULL, 
	role VARCHAR(20) DEFAULT 'member' NOT NULL, 
	pronouns VARCHAR(40), 
	job_title VARCHAR(100), 
	bio VARCHAR(280), 
	timezone VARCHAR(64), 
	onboarded_at DATETIME, 
	tour_completed_at DATETIME, 
	intended_use TEXT, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (email), 
	UNIQUE (invite_token)
);
CREATE TABLE video_avatars (
	id VARCHAR(36) NOT NULL, 
	org_id VARCHAR(36), 
	name VARCHAR(100) NOT NULL, 
	description TEXT, 
	provider VARCHAR(30) NOT NULL, 
	replica_id VARCHAR(100) NOT NULL, 
	tavus_persona_id VARCHAR(64), 
	preview_url VARCHAR(500), 
	gender VARCHAR(10), 
	voice_id VARCHAR(100), 
	realtime_voice VARCHAR(30), 
	voice_sample_url VARCHAR(500), 
	is_system BOOLEAN NOT NULL, 
	sort_order INTEGER NOT NULL, 
	deleted_at DATETIME, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(org_id) REFERENCES organizations (id)
);
CREATE TABLE vocabulary_entries (
	id VARCHAR(36) NOT NULL, 
	org_id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36), 
	canonical_form VARCHAR(500) NOT NULL, 
	category VARCHAR(50) NOT NULL, 
	phonetic_hint VARCHAR(500), 
	boost_weight FLOAT NOT NULL, 
	source VARCHAR(30) NOT NULL, 
	usage_count INTEGER NOT NULL, 
	deleted_at DATETIME, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(org_id) REFERENCES organizations (id), 
	FOREIGN KEY(user_id) REFERENCES users (id)
);
CREATE TABLE vocabulary_variants (
	id VARCHAR(36) NOT NULL, 
	entry_id VARCHAR(36) NOT NULL, 
	variant_text VARCHAR(500) NOT NULL, 
	variant_lower VARCHAR(500) NOT NULL, 
	confidence FLOAT NOT NULL, 
	occurrence_count INTEGER NOT NULL, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(entry_id) REFERENCES vocabulary_entries (id) ON DELETE CASCADE
);
CREATE TABLE voice_profiles (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36) NOT NULL, 
	org_id VARCHAR(36) NOT NULL, 
	sample_results JSON, 
	accent_detected VARCHAR(20), 
	training_completed_at DATETIME, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (user_id), 
	FOREIGN KEY(user_id) REFERENCES users (id), 
	FOREIGN KEY(org_id) REFERENCES organizations (id)
);
CREATE INDEX ix_blueprint_iterations_share_token ON blueprint_iterations (share_token);
CREATE INDEX ix_card_attachments_card_id ON card_attachments (card_id);
CREATE INDEX ix_card_events_card_created ON card_events (card_id, created_at);
CREATE INDEX ix_card_external_links_integration_state ON card_external_links (integration_id, sync_state);
CREATE INDEX ix_card_external_links_org_id ON card_external_links (org_id);
CREATE INDEX ix_card_external_links_provider_external_id ON card_external_links (provider, external_id);
CREATE INDEX ix_card_links_source_card_id ON card_links (source_card_id);
CREATE INDEX ix_card_links_target_card_id ON card_links (target_card_id);
CREATE INDEX ix_card_views_org_id ON card_views (org_id);
CREATE INDEX ix_card_views_user_id ON card_views (user_id);
CREATE UNIQUE INDEX ix_cards_friendly_id ON cards (friendly_id);
CREATE INDEX ix_cards_number ON cards (number);
CREATE INDEX ix_cards_project_id ON cards (project_id);
CREATE UNIQUE INDEX ix_character_video_previews_cache_key ON character_video_previews (cache_key);
CREATE INDEX ix_directory_team_category ON directory_entries (team_id, category);
CREATE INDEX ix_feedback_org_created ON feedback (org_id, created_at);
CREATE INDEX ix_feedback_session ON feedback (session_id);
CREATE INDEX ix_feedback_target ON feedback (target_type, target_id);
CREATE INDEX ix_feedback_user_created ON feedback (user_id, created_at);
CREATE INDEX ix_generation_granularities_org ON generation_granularities (org_id);
CREATE INDEX ix_generation_modifiers_org ON generation_modifiers (org_id);
CREATE INDEX ix_generation_presets_org ON generation_presets (org_id);
CREATE INDEX ix_org_integration_category ON org_integrations (org_id, category);
CREATE INDEX ix_pricing_overrides_lookup ON pricing_overrides (provider, operation, model, org_id);
CREATE INDEX ix_project_attachments_project_id ON project_attachments (project_id);
CREATE INDEX ix_repo_analysis_jobs_project_status ON repo_analysis_jobs (project_id, status);
CREATE INDEX ix_report_subscriptions_next_run ON report_subscriptions (next_run_at);
CREATE INDEX ix_report_subscriptions_org ON report_subscriptions (org_id, is_active);
CREATE INDEX ix_session_events_session_id ON session_events (session_id);
CREATE INDEX ix_slack_session_announcements_session_id ON slack_session_announcements (session_id);
CREATE INDEX ix_status_incident_updates_incident ON status_incident_updates (incident_id, posted_at);
CREATE INDEX ix_status_probes_component_ts ON status_probes (component_id, ts);
CREATE INDEX ix_status_probes_ts ON status_probes (ts);
CREATE INDEX ix_subscription_runs_subscription ON subscription_runs (subscription_id, started_at);
CREATE INDEX ix_sync_events_card_created ON sync_events (card_id, created_at);
CREATE INDEX ix_task_generation_jobs_project_status ON task_generation_jobs (project_id, status);
CREATE INDEX ix_task_generation_jobs_session_status ON task_generation_jobs (session_id, status);
CREATE INDEX ix_team_slack_channels_team_id ON team_slack_channels (team_id);
CREATE INDEX ix_theme_presets_org_scope ON theme_presets (org_id, scope);
CREATE INDEX ix_theme_presets_owner_user_id ON theme_presets (owner_user_id);
CREATE INDEX ix_ticket_templates_org_id ON ticket_templates (org_id);
CREATE INDEX ix_ticket_templates_project_id ON ticket_templates (project_id);
CREATE INDEX ix_usage_events_org_occurred ON usage_events (org_id, occurred_at);
CREATE INDEX ix_usage_events_project_occurred ON usage_events (project_id, occurred_at);
CREATE INDEX ix_usage_events_provider_occurred ON usage_events (provider, occurred_at);
CREATE INDEX ix_usage_events_session ON usage_events (session_id);
CREATE INDEX ix_variant_lower ON vocabulary_variants (variant_lower);
CREATE INDEX ix_vocab_org_canonical ON vocabulary_entries (org_id, canonical_form);
CREATE INDEX ix_vocab_org_user ON vocabulary_entries (org_id, user_id);
CREATE UNIQUE INDEX uq_generation_granularities_org_slug_active ON generation_granularities (org_id, slug);
CREATE UNIQUE INDEX uq_generation_modifiers_org_slug_active ON generation_modifiers (org_id, slug);
CREATE UNIQUE INDEX uq_generation_presets_org_slug_active ON generation_presets (org_id, slug);
CREATE UNIQUE INDEX uq_org_spend_alerts_sent ON org_spend_alerts_sent (org_id, year_month, threshold);
