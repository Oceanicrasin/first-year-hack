import com.sun.net.httpserver.HttpServer;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpExchange;

import java.io.*;
import java.net.*;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;

import game.GameSession;
import game.Board;
import game.Piece;

public class Main {
    private static final int PORT = 8080;
    private static final String WEBROOT = "webroot";

    // Game state
    private static final Map<String, OutputStream> players = new ConcurrentHashMap<>();
    private static final Map<String, Integer> playerIds = new ConcurrentHashMap<>();
    private static GameSession gameSession = new GameSession();
    private static volatile boolean gameRunning = false;
    private static volatile Timer gameTimer = null;

    public static void main(String[] args) throws IOException {
        System.out.println("🎮 Sabotage Tetris Server Starting...");

        HttpServer httpServer = HttpServer.create(new InetSocketAddress(PORT), 0);
        httpServer.setExecutor(Executors.newFixedThreadPool(4));

        // Serve static files
        httpServer.createContext("/", exchange -> {
            String path = exchange.getRequestURI().getPath();
            if (path.equals("/")) path = "/index.html";

            Path filePath = Paths.get(WEBROOT).resolve(path.substring(1)).normalize();
            if (Files.exists(filePath) && Files.isRegularFile(filePath)) {
                String contentType = getContentType(filePath.toString());
                byte[] content = Files.readAllBytes(filePath);
                exchange.getResponseHeaders().set("Content-Type", contentType);
                exchange.sendResponseHeaders(200, content.length);
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(content);
                }
            } else {
                exchange.sendResponseHeaders(404, -1);
            }
        });

        // WebSocket upgrade handler
        httpServer.createContext("/ws", exchange -> {
            if (isWebSocketUpgrade(exchange)) {
                handleWebSocket(exchange);
            } else {
                exchange.sendResponseHeaders(400, -1);
            }
        });

        httpServer.start();
        System.out.println("🌐 Server started on port " + PORT);
        System.out.println("\n🎯 Open http://localhost:" + PORT + " in TWO browser tabs to play!");
        System.out.println("🎯 Each tab represents one player");
        System.out.println("🎯 Round 1: Player 1 places, Player 2 sabotages (rotation)");
        System.out.println("🎯 Round 2: Player 2 places, Player 1 sabotages (rotation)");
        System.out.println("🎯 Higher score wins!\n");
    }

    private static String getContentType(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".js")) return "application/javascript";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".jpg")) return "image/jpeg";
        return "application/octet-stream";
    }

    private static boolean isWebSocketUpgrade(HttpExchange exchange) {
        String upgrade = exchange.getRequestHeaders().getFirst("Upgrade");
        String connection = exchange.getRequestHeaders().getFirst("Connection");
        return "websocket".equalsIgnoreCase(upgrade) &&
               (connection == null || connection.toLowerCase().contains("upgrade"));
    }

    private static void handleWebSocket(HttpExchange exchange) throws IOException {
        // WebSocket handshake
        String key = exchange.getRequestHeaders().getFirst("Sec-WebSocket-Key");
        String guid = "258EAFA5-E914-47DA-95CA-5AB5DC769000";
        byte[] hash;
        try {
            MessageDigest sha1 = MessageDigest.getInstance("SHA-1");
            hash = sha1.digest((key + guid).getBytes("UTF-8"));
        } catch (Exception e) {
            throw new IOException("SHA-1 not available", e);
        }
        String accept = Base64.getEncoder().encodeToString(hash);

        // Send handshake response
        String response = "HTTP/1.1 101 Switching Protocols\r\n" +
            "Upgrade: websocket\r\n" +
            "Connection: Upgrade\r\n" +
            "Sec-WebSocket-Accept: " + accept + "\r\n\r\n";

        exchange.sendResponseHeaders(101, 0);
        OutputStream os = exchange.getResponseBody();
        os.write(response.getBytes());
        os.flush();

        // Register player
        String playerKey = "ws:" + System.currentTimeMillis();
        int playerId = players.size() + 1;
        players.put(playerKey, os);
        playerIds.put(playerKey, playerId);

        System.out.println("Player " + playerId + " connected");
        broadcastState();

        // Read WebSocket frames
        InputStream is = exchange.getRequestBody();
        try {
            while (true) {
                byte[] header = new byte[2];
                int read = is.read(header);
                if (read != 2) break;

                int payloadLen = header[1] & 0x7F;
                if (payloadLen == 126) {
                    byte[] ext = new byte[2];
                    is.read(ext);
                    payloadLen = ((ext[0] & 0xFF) << 8) | (ext[1] & 0xFF);
                }

                byte[] mask = new byte[4];
                is.read(mask);

                byte[] payload = new byte[payloadLen];
                is.read(payload);

                // Unmask
                for (int i = 0; i < payload.length; i++) {
                    payload[i] ^= mask[i % 4];
                }

                String message = new String(payload, "UTF-8");
                handleCommand(message.trim(), playerId);
            }
        } catch (IOException e) {
            // Client disconnected
        } finally {
            players.remove(playerKey);
            playerIds.remove(playerKey);
            System.out.println("Player disconnected. " + players.size() + " remaining.");
            broadcastState();
        }
    }

    private static void handleCommand(String command, int playerId) {
        switch (command) {
            case "START":
                if (players.size() >= 2 && !gameRunning) {
                    gameRunning = true;
                    gameSession.startGame();
                    gameTimer = new Timer();
                    gameTimer.scheduleAtFixedRate(new TimerTask() {
                        @Override
                        public void run() {
                            gameSession.tick();
                            broadcastState();
                        }
                    }, 500, 500);
                    broadcastState();
                }
                break;
            case "LEFT":
                if (isPlacementPlayer(playerId)) gameSession.moveLeft();
                break;
            case "RIGHT":
                if (isPlacementPlayer(playerId)) gameSession.moveRight();
                break;
            case "DOWN":
                if (isPlacementPlayer(playerId)) gameSession.moveDown();
                break;
            case "DROP":
                if (isPlacementPlayer(playerId)) gameSession.hardDrop();
                break;
            case "ROTATE":
                if (isSabotagePlayer(playerId)) gameSession.rotate();
                break;
            case "RESTART":
                gameRunning = false;
                if (gameTimer != null) {
                    gameTimer.cancel();
                    gameTimer = null;
                }
                gameSession = new GameSession();
                break;
        }
        broadcastState();
    }

    private static boolean isPlacementPlayer(int playerId) {
        if (!gameRunning) return false;
        GameSession.Round round = gameSession.getCurrentRound();
        if (round == GameSession.Round.ROUND1) return playerId == 1;
        if (round == GameSession.Round.ROUND2) return playerId == 2;
        return false;
    }

    private static boolean isSabotagePlayer(int playerId) {
        if (!gameRunning) return false;
        GameSession.Round round = gameSession.getCurrentRound();
        if (round == GameSession.Round.ROUND1) return playerId == 2;
        if (round == GameSession.Round.ROUND2) return playerId == 1;
        return false;
    }

    private static void broadcastState() {
        String state = serializeState();
        byte[] data = state.getBytes();
        byte[] frame = new byte[2 + data.length];
        frame[0] = (byte) 0x81; // FIN + text opcode
        frame[1] = (byte) data.length; // payload length
        System.arraycopy(data, 0, frame, 2, data.length);

        for (OutputStream os : players.values()) {
            try {
                os.write(frame);
                os.flush();
            } catch (Exception e) {
                // Ignore broken connections
            }
        }
    }

    private static String serializeState() {
        StringBuilder sb = new StringBuilder();
        sb.append("STATE|");
        sb.append(gameRunning ? "RUNNING" : "WAITING").append("|");
        sb.append(players.size()).append("|");
        sb.append(gameSession.getCurrentRound()).append("|");
        sb.append(gameSession.getPlayer1Score()).append("|");
        sb.append(gameSession.getPlayer2Score()).append("|");

        Board board = gameSession.getBoard();
        String[][] grid = board.getGrid();
        for (int i = 0; i < Board.HEIGHT; i++) {
            for (int j = 0; j < Board.WIDTH; j++) {
                sb.append(grid[i][j] == null ? "." : grid[i][j]).append(",");
            }
        }
        sb.append("|");

        Piece piece = gameSession.getCurrentPiece();
        if (piece != null) {
            sb.append(piece.getX()).append(",");
            sb.append(piece.getY()).append(",");
            sb.append(piece.getColor()).append(",");
            sb.append(piece.getType().name()).append("|");
        } else {
            sb.append("0,0,#000000,NONE|");
        }

        Piece next = gameSession.getNextPiece();
        if (next != null) {
            sb.append(next.getColor()).append(",");
            sb.append(next.getType().name()).append("|");
        } else {
            sb.append("#000000,NONE|");
        }

        String winner = gameSession.getWinner();
        sb.append(winner == null ? "NONE" : winner);

        return sb.toString();
    }

}
