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
	id UUID NOT NULL, 
	email VARCHAR(320) NOT NULL, 
	hashed_password VARCHAR(1024) NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	is_superuser BOOLEAN NOT NULL, 
	is_verified BOOLEAN NOT NULL, 
	PRIMARY KEY (id)
);


CREATE TABLE clans (
	id UUID NOT NULL, 
	name VARCHAR(50) NOT NULL, 
	tag VARCHAR(6) NOT NULL, 
	description VARCHAR(255), 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	leader_id UUID NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(leader_id) REFERENCES users (id) ON DELETE RESTRICT
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


CREATE TABLE user_solved_puzzles (
	user_id UUID NOT NULL, 
	puzzle_id VARCHAR NOT NULL, 
	solved_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (user_id, puzzle_id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
	FOREIGN KEY(puzzle_id) REFERENCES puzzles (id) ON DELETE CASCADE
);


CREATE TABLE clan_members (
	id UUID NOT NULL, 
	clan_id UUID NOT NULL, 
	user_id UUID NOT NULL, 
	role clanrole NOT NULL, 
	joined_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_clan_member UNIQUE (clan_id, user_id), 
	FOREIGN KEY(clan_id) REFERENCES clans (id) ON DELETE CASCADE, 
	UNIQUE (user_id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

