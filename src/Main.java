import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;

import game.GameSession;
import game.Board;
import game.Piece;

public class Main {
    private static final int PORT = 8080;
    private static final String WEBROOT = "webroot";
    private static final long SESSION_TIMEOUT_MS = 15_000;
    private static final long ROTATION_COOLDOWN_MS = 3_000;

    private static final Map<String, PlayerSession> players = new HashMap<>();
    private static GameSession gameSession = new GameSession();
    private static volatile boolean gameRunning = false;
    private static Timer gameTimer;
    private static long stateVersion = 0;
    private static final long[] lastRotationAt = new long[3];

    private static class PlayerSession {
        int playerId;
        long lastSeen;

        PlayerSession(int playerId, long lastSeen) {
            this.playerId = playerId;
            this.lastSeen = lastSeen;
        }
    }

    public static void main(String[] args) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress("0.0.0.0", PORT), 0);
        server.setExecutor(Executors.newCachedThreadPool());
        server.createContext("/api/state", Main::handleState);
        server.createContext("/api/command", Main::handleCommandRequest);
        server.createContext("/", Main::handleStaticFile);
        server.start();

        String hostIp;
        try {
            hostIp = InetAddress.getLocalHost().getHostAddress();
        } catch (UnknownHostException e) {
            hostIp = "localhost";
        }
        System.out.println("Sabotage Tetris server started on port " + PORT);
        System.out.println("Host: http://localhost:" + PORT);
        System.out.println("Join from another device: http://" + hostIp + ":" + PORT);
        System.out.println("Game state and commands use HTTP polling; no WebSocket connection is required.");
    }

    private static void handleStaticFile(HttpExchange exchange) throws IOException {
        if (!"GET".equals(exchange.getRequestMethod())) {
            respond(exchange, 405, "Method Not Allowed", "text/plain; charset=utf-8");
            return;
        }
        String requestPath = exchange.getRequestURI().getPath();
        if ("/".equals(requestPath)) requestPath = "/index.html";
        Path root = Paths.get(WEBROOT).toAbsolutePath().normalize();
        Path file = root.resolve(requestPath.substring(1)).normalize();
        if (!file.startsWith(root) || !Files.isRegularFile(file)) {
            respond(exchange, 404, "Not Found", "text/plain; charset=utf-8");
            return;
        }
        String type = file.toString().endsWith(".html") ? "text/html; charset=utf-8" :
                      file.toString().endsWith(".css") ? "text/css; charset=utf-8" :
                      file.toString().endsWith(".js") ? "application/javascript; charset=utf-8" :
                      "application/octet-stream";
        byte[] body = Files.readAllBytes(file);
        exchange.getResponseHeaders().set("Content-Type", type);
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.sendResponseHeaders(200, body.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(body);
        }
    }

    private static void handleState(HttpExchange exchange) throws IOException {
        if (!"GET".equals(exchange.getRequestMethod())) {
            respond(exchange, 405, "Method Not Allowed", "text/plain; charset=utf-8");
            return;
        }
        String clientId = queryParameters(exchange.getRequestURI().getRawQuery()).get("id");
        if (!validClientId(clientId)) {
            respond(exchange, 400, "A valid session id is required", "text/plain; charset=utf-8");
            return;
        }

        String state;
        synchronized (Main.class) {
            refreshSessions();
            PlayerSession session = players.get(clientId);
            if (session == null) {
                int assignedId = findAvailablePlayerId();
                session = new PlayerSession(assignedId, System.currentTimeMillis());
                players.put(clientId, session);
                System.out.println((assignedId == 0 ? "Spectator" : "Player " + assignedId) +
                                   " joined from " + exchange.getRemoteAddress().getAddress().getHostAddress() +
                                   " (" + connectedPlayerCount() + "/2 players)");
            } else if (session.playerId == 0) {
                int assignedId = findAvailablePlayerId();
                if (assignedId != 0) {
                    session.playerId = assignedId;
                    System.out.println("Spectator promoted to Player " + assignedId);
                }
            }
            session.lastSeen = System.currentTimeMillis();
            startGameIfReady();
            state = serializeState() + "|" + session.playerId + "|" + stateVersion +
                    "|" + getRotationCooldownRemaining(session.playerId);
        }
        respond(exchange, 200, state, "text/plain; charset=utf-8");
    }

    private static void handleCommandRequest(HttpExchange exchange) throws IOException {
        if (!"POST".equals(exchange.getRequestMethod())) {
            respond(exchange, 405, "Method Not Allowed", "text/plain; charset=utf-8");
            return;
        }
        String body;
        try (InputStream in = exchange.getRequestBody()) {
            body = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
        Map<String, String> params = queryParameters(body);
        String clientId = params.get("id");
        String command = params.get("command");
        if (!validClientId(clientId) || command == null) {
            respond(exchange, 400, "A valid session id and command are required", "text/plain; charset=utf-8");
            return;
        }

        synchronized (Main.class) {
            refreshSessions();
            PlayerSession session = players.get(clientId);
            if (session == null) {
                respond(exchange, 409, "Session expired; reconnecting", "text/plain; charset=utf-8");
                return;
            }
            session.lastSeen = System.currentTimeMillis();
            String result = handleGameCommand(command, session.playerId);
            stateVersion++;
            String responseState = serializeState() + "|" + session.playerId + "|" + stateVersion +
                    "|" + getRotationCooldownRemaining(session.playerId) + "|" + result;
            respond(exchange, 200, responseState, "text/plain; charset=utf-8");
            return;
        }
    }

    private static Map<String, String> queryParameters(String encoded) {
        Map<String, String> values = new HashMap<>();
        if (encoded == null || encoded.isEmpty()) return values;
        for (String item : encoded.split("&")) {
            String[] pair = item.split("=", 2);
            try {
                String key = URLDecoder.decode(pair[0], "UTF-8");
                String value = pair.length == 2 ? URLDecoder.decode(pair[1], "UTF-8") : "";
                values.put(key, value);
            } catch (IllegalArgumentException | UnsupportedEncodingException ignored) {
                return Collections.emptyMap();
            }
        }
        return values;
    }

    private static boolean validClientId(String id) {
        return id != null && id.matches("[a-fA-F0-9-]{16,64}");
    }

    private static synchronized void refreshSessions() {
        long cutoff = System.currentTimeMillis() - SESSION_TIMEOUT_MS;
        Iterator<Map.Entry<String, PlayerSession>> iterator = players.entrySet().iterator();
        while (iterator.hasNext()) {
            Map.Entry<String, PlayerSession> entry = iterator.next();
            if (entry.getValue().lastSeen < cutoff) {
                System.out.println("Player " + entry.getValue().playerId + " timed out");
                iterator.remove();
            }
        }
    }

    private static int findAvailablePlayerId() {
        boolean p1 = false;
        boolean p2 = false;
        for (PlayerSession session : players.values()) {
            if (session.playerId == 1) p1 = true;
            if (session.playerId == 2) p2 = true;
        }
        return !p1 ? 1 : (!p2 ? 2 : 0);
    }

    private static int connectedPlayerCount() {
        int count = 0;
        for (PlayerSession session : players.values()) if (session.playerId != 0) count++;
        return count;
    }

    private static void startGameIfReady() {
        if (connectedPlayerCount() < 2 || gameRunning) return;
        gameRunning = true;
        gameSession.startGame();
        stateVersion++;
        gameTimer = new Timer("tetris-game-loop", true);
        gameTimer.scheduleAtFixedRate(new TimerTask() {
            @Override
            public void run() {
                synchronized (Main.class) {
                    if (gameRunning) {
                        gameSession.tick();
                        stateVersion++;
                    }
                }
            }
        }, 500, 500);
        System.out.println("Two players connected. Game started.");
    }

    private static String handleGameCommand(String command, int playerId) {
        switch (command) {
            case "START":
                startGameIfReady();
                return gameRunning ? "OK" : "WAITING_FOR_PLAYER";
            case "LEFT": if (isPlacementPlayer(playerId)) gameSession.moveLeft(); break;
            case "RIGHT": if (isPlacementPlayer(playerId)) gameSession.moveRight(); break;
            case "DOWN": if (isPlacementPlayer(playerId)) gameSession.moveDown(); break;
            case "DROP": if (isPlacementPlayer(playerId)) gameSession.hardDrop(); break;
            case "ROTATE":
                if (!gameRunning) return "NOT_RUNNING";
                if (playerId < 1 || playerId > 2) return "NOT_PLAYER";
                long now = System.currentTimeMillis();
                boolean sabotageRotation = isSabotagePlayer(playerId);
                if (sabotageRotation && now - lastRotationAt[playerId] < ROTATION_COOLDOWN_MS) {
                    return "COOLDOWN";
                }
                if (!gameSession.rotate()) return "BLOCKED";
                if (sabotageRotation) lastRotationAt[playerId] = now;
                return "OK";
            case "RESTART":
                gameRunning = false;
                if (gameTimer != null) {
                    gameTimer.cancel();
                    gameTimer = null;
                }
                gameSession = new GameSession();
                Arrays.fill(lastRotationAt, 0);
                return "OK";
            default: return "UNKNOWN_COMMAND";
        }
        return "OK";
    }

    private static boolean isPlacementPlayer(int playerId) {
        if (!gameRunning) return false;
        GameSession.Round round = gameSession.getCurrentRound();
        return (round == GameSession.Round.ROUND1 && playerId == 1) ||
               (round == GameSession.Round.ROUND2 && playerId == 2);
    }

    private static boolean isSabotagePlayer(int playerId) {
        if (!gameRunning) return false;
        GameSession.Round round = gameSession.getCurrentRound();
        return (round == GameSession.Round.ROUND1 && playerId == 2) ||
               (round == GameSession.Round.ROUND2 && playerId == 1);
    }

    private static long getRotationCooldownRemaining(int playerId) {
        if (playerId < 1 || playerId > 2 || !isSabotagePlayer(playerId)) return 0;
        return Math.max(0, ROTATION_COOLDOWN_MS -
                (System.currentTimeMillis() - lastRotationAt[playerId]));
    }

    private static void respond(HttpExchange exchange, int status, String body, String contentType) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", contentType);
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.sendResponseHeaders(status, status == 204 ? -1 : bytes.length);
        if (status != 204) {
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(bytes);
            }
        } else {
            exchange.close();
        }
    }

    private static String serializeState() {
        StringBuilder sb = new StringBuilder();
        sb.append("STATE|").append(gameRunning ? "RUNNING" : "WAITING").append("|");
        sb.append(connectedPlayerCount()).append("|");
        sb.append(gameSession.getCurrentRound()).append("|");
        sb.append(gameSession.getPlayer1Score()).append("|");
        sb.append(gameSession.getPlayer2Score()).append("|");
        Board board = gameSession.getBoard();
        String[][] grid = board.getGrid();
        for (int i = 0; i < Board.HEIGHT; i++) {
            for (int j = 0; j < Board.WIDTH; j++) sb.append(grid[i][j] == null ? "." : grid[i][j]).append(",");
        }
        sb.append("|");
        Piece piece = gameSession.getCurrentPiece();
        if (piece != null) {
            sb.append(piece.getX()).append(",").append(piece.getY()).append(",");
            sb.append(piece.getColor()).append(",").append(piece.getType().name()).append(",");
            int[][] shape = piece.getShape();
            sb.append(shape.length).append(":");
            for (int[] row : shape) {
                for (int cell : row) sb.append(cell == 0 ? '0' : '1');
            }
            sb.append("|");
        } else {
            sb.append("0,0,#000000,NONE|");
        }
        Piece next = gameSession.getNextPiece();
        if (next != null) sb.append(next.getColor()).append(",").append(next.getType().name()).append("|");
        else sb.append("#000000,NONE|");
        String winner = gameSession.getWinner();
        sb.append(winner == null ? "NONE" : winner);
        return sb.toString();
    }
}
