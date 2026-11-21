# Sabotage Tetris

An online two-player Tetris game with a unique **rotation-sabotage** mechanic.

## How It Works

The game has **two rounds** with swapped roles:

| Round | Player 1 | Player 2 |
|-------|----------|----------|
| Round 1 | Controls **placement** (moves the piece) | Controls **rotation** (sabotages) |
| Round 2 | Controls **rotation** (sabotages) | Controls **placement** (moves the piece) |

After both rounds, the player with the **higher score wins**.

## How to Run

### 1. Compile and Start the Server

Open a terminal in the project directory and run:

```bash
javac -d out src/game/Tetromino.java src/game/Piece.java src/game/Board.java src/game/GameSession.java src/Main.java
java -cp out Main
```

The server will start on **port 8080** and print:

```
Game server started on port 8080
Open http://localhost:8080 in two browser tabs to play!
```

### 2. Join the Game

* **Local play (same computer):** Open `http://localhost:8080` in **two separate browser tabs or windows**. Each tab represents one player.
* **Remote play (different computers):** Replace `localhost` with your computer's IP address. For example, if your IP is `192.168.1.50`, the second player opens `http://192.168.1.50:8080` from their browser. Make sure your firewall allows incoming connections on port 8080.

### 3. Start Playing

1. Both players click **"Start Game"** once both tabs are open.
2. **Round 1:** Player 1 controls placement (arrow keys + Space to drop), Player 2 controls rotation (press **R**) to sabotage.
3. **Round 2:** Roles swap — Player 2 places, Player 1 rotates to sabotage.
4. After Round 2 ends, the player with the **higher score wins**.

## Controls

| Action       | Key          |
|------------- |------------- |
| Move left    | ← Arrow      |
| Move right   | → Arrow      |
| Soft drop    | ↓ Arrow      |
| Hard drop    | Space        |
| Rotate       | R            |

Mobile on-screen buttons are also available.

## Project Structure

```
├── src/
│   ├── game/
│   │   ├── Tetromino.java    # Tetris piece definitions (I, O, T, S, Z, J, L)
│   │   ├── Piece.java        # Active falling piece with position and rotation
│   │   ├── Board.java        # 10x20 game grid, collision detection, line clearing
│   │   └── GameSession.java  # Two-round sabotage game mode logic
│   └── Main.java             # HTTP + WebSocket server, game loop, state broadcasting
└── webroot/
    └── index.html            # Game UI with Canvas rendering and controls
```
