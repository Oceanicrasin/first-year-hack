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

The server will start on **port 8080** and print the address to share with the other player. It uses regular HTTP requests for game updates, so browsers do not need a WebSocket connection.

```
Sabotage Tetris server started on port 8080
Join from another device: http://192.168.x.x:8080
```

### 2. Join from a Different Computer

Both players must be on the **same Wi-Fi/network**.

**Step 1: Find your IP address**

* **Mac:** Open Terminal and run `ipconfig getifaddr en0` (or `ifconfig | grep "inet "`)
* **Windows:** Open Command Prompt and run `ipconfig`, look for the `IPv4 Address` line (e.g., `192.168.1.50`)
* **Linux:** Open a terminal and run `hostname -I`

Your IP will look something like `192.168.x.x` or `10.x.x.x`.

**Step 2: Share the URL with the second player**

Replace `localhost` with your IP address. For example, if your IP is `192.168.1.50`:

* **Player 1 (host):** Opens `http://localhost:8080`
* **Player 2 (joins):** Opens `http://192.168.1.50:8080` from their browser

**Step 3: Allow the firewall (if prompted)**

* **Mac:** When Java first starts, macOS may ask to allow incoming connections — click **Allow**.
* **Windows:** If a Windows Firewall prompt appears, check both **Private** and **Public** networks and click **Allow access**.
* **Linux:** If using `ufw`, run `sudo ufw allow 8080/tcp`.

> **Local play (same computer):** Open `http://localhost:8080` in two separate browser tabs instead.

### 3. Start Playing

1. The game starts automatically when both players have connected. The **"Start Game"** button is also available while the game is waiting.
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
│   └── Main.java             # HTTP server, player sessions, polling API, game loop
└── webroot/
    └── index.html            # Game UI with Canvas rendering and controls
```
