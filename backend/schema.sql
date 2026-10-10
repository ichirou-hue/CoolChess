CREATE TABLE puzzles (
	id VARCHAR NOT NULL,
	fen VARCHAR NOT NULL,
	moves VARCHAR NOT NULL,
	rating INTEGER NOT NULL,
	rating_deviation INTEGER,
	popularity INTEGER,
	themes VARCHAR NOT NULL,
	game_url VARCHAR,
	PRIMARY KEY (id)
);


CREATE TABLE users (
	display_name VARCHAR(32) DEFAULT 'Игрок' NOT NULL,
	role userrole NOT NULL,
	elo_rating INTEGER NOT NULL,
	xp INTEGER NOT NULL,
	level INTEGER NOT NULL,
	coins INTEGER NOT NULL,
	games_played INTEGER NOT NULL,
	tournaments_played INTEGER NOT NULL,
	tournaments_won INTEGER NOT NULL,
	tournaments_podium INTEGER NOT NULL,
	lichess_username VARCHAR(50),
	lichess_blitz_rating INTEGER,
	lichess_rapid_rating INTEGER,
	lichess_puzzle_rating INTEGER,
	lichess_verification_code VARCHAR(32),
	lichess_verification_username VARCHAR(50),
	lichess_verification_expires_at TIMESTAMP WITH TIME ZONE,
	lichess_verification_attempts INTEGER DEFAULT '0' NOT NULL,
	chesscom_username VARCHAR(50),
	chesscom_blitz_rating INTEGER,
	chesscom_rapid_rating INTEGER,
	chesscom_bullet_rating INTEGER,
	chesscom_daily_rating INTEGER,
	chesscom_verification_code VARCHAR(32),
	chesscom_verification_username VARCHAR(50),
	chesscom_verification_expires_at TIMESTAMP WITH TIME ZONE,
	chesscom_verification_attempts INTEGER DEFAULT '0' NOT NULL,
	email_verification_code_hash VARCHAR(64),
	email_verification_expires_at TIMESTAMP WITH TIME ZONE,
	email_verification_sent_at TIMESTAMP WITH TIME ZONE,
	email_verification_attempts INTEGER DEFAULT '0' NOT NULL,
	id UUID NOT NULL,
	email VARCHAR(320) NOT NULL,
	hashed_password VARCHAR(1024) NOT NULL,
	is_active BOOLEAN NOT NULL,
	is_superuser BOOLEAN NOT NULL,
	is_verified BOOLEAN NOT NULL,
	PRIMARY KEY (id)
);


CREATE TABLE games (
	id UUID NOT NULL,
	user_id UUID NOT NULL,
	status gamestatus NOT NULL,
	player_color playercolor NOT NULL,
	bot_difficulty INTEGER NOT NULL,
	current_fen VARCHAR NOT NULL,
	moves_uci TEXT NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);


CREATE TABLE tournaments (
	id UUID NOT NULL,
	name VARCHAR(80) NOT NULL,
	description TEXT,
	format VARCHAR(24) NOT NULL,
	time_control INTEGER NOT NULL,
	increment INTEGER NOT NULL,
	max_players INTEGER NOT NULL,
	status VARCHAR(16) NOT NULL,
	created_at TIMESTAMP WITH TIME ZONE NOT NULL,
	created_by_id UUID NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(created_by_id) REFERENCES users (id) ON DELETE RESTRICT
);


CREATE TABLE user_solved_puzzles (
	user_id UUID NOT NULL,
	puzzle_id VARCHAR NOT NULL,
	solved_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (user_id, puzzle_id),
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE,
	FOREIGN KEY(puzzle_id) REFERENCES puzzles (id) ON DELETE CASCADE
);


CREATE TABLE tournament_participants (
	id UUID NOT NULL,
	tournament_id UUID NOT NULL,
	user_id UUID NOT NULL,
	group_name VARCHAR(24),
	preferred_color VARCHAR(8),
	joined_at TIMESTAMP WITH TIME ZONE NOT NULL,
	PRIMARY KEY (id),
	CONSTRAINT uq_tournament_participant UNIQUE (tournament_id, user_id),
	FOREIGN KEY(tournament_id) REFERENCES tournaments (id) ON DELETE CASCADE,
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);
