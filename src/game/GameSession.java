package game;

public class GameSession {
    public enum Round { ROUND1, ROUND2, FINISHED }
    public enum Role { PLACEMENT, SABOTAGE }

    private Board board;
    private Piece currentPiece;
    private Piece nextPiece;
    private Round currentRound;
    private boolean gameStarted;
    private boolean roundTransition;

    // Round 1: Player 1 places, Player 2 rotates
    // Round 2: Player 2 places, Player 1 rotates
    private int player1Score;
    private int player2Score;

    public GameSession() {
        board = new Board();
        currentRound = Round.ROUND1;
        gameStarted = false;
        roundTransition = false;
        player1Score = 0;
        player2Score = 0;
        spawnNewPiece();
    }

    public void startGame() {
        gameStarted = true;
        currentRound = Round.ROUND1;
        board.reset();
        spawnNewPiece();
    }

    public void spawnNewPiece() {
        if (nextPiece == null) {
            currentPiece = new Piece(Tetromino.random());
        } else {
            currentPiece = nextPiece;
        }
        nextPiece = new Piece(Tetromino.random());
    }

    public boolean moveLeft() {
        if (board.isValidPosition(currentPiece, -1, 0)) {
            currentPiece.moveX(-1);
            return true;
        }
        return false;
    }

    public boolean moveRight() {
        if (board.isValidPosition(currentPiece, 1, 0)) {
            currentPiece.moveX(1);
            return true;
        }
        return false;
    }

    public boolean moveDown() {
        if (board.isValidPosition(currentPiece, 0, 1)) {
            currentPiece.moveY(1);
            return true;
        }
        return false;
    }

    public boolean hardDrop() {
        int dropDistance = 0;
        while (board.isValidPosition(currentPiece, 0, dropDistance + 1)) {
            dropDistance++;
        }
        currentPiece.moveY(dropDistance);
        lockAndSpawn();
        return true;
    }

    public boolean rotate() {
        if (!gameStarted || currentRound == Round.FINISHED || currentPiece == null) return false;
        int[][] rotated = new int[currentPiece.getShape()[0].length][currentPiece.getShape().length];
        int[][] shape = currentPiece.getShape();
        for (int i = 0; i < shape.length; i++) {
            for (int j = 0; j < shape[i].length; j++) {
                rotated[j][shape.length - 1 - i] = shape[i][j];
            }
        }
        // Try rotation at current position first
        if (board.isValidRotation(currentPiece, rotated)) {
            currentPiece.rotate();
            return true;
        }
        // Try wall kicks: shift left or right to make rotation fit
        for (int kick : new int[]{-1, 1, -2, 2, -3, 3}) {
            if (board.isValidRotationWithOffset(currentPiece, rotated, kick, 0)) {
                currentPiece.moveX(kick);
                currentPiece.rotate();
                return true;
            }
        }
        return false;
    }

    private void lockAndSpawn() {
        board.lockPiece(currentPiece);
        if (board.isGameOver()) {
            endRound();
        } else {
            spawnNewPiece();
            // Check if new piece can spawn
            if (!board.isValidPosition(currentPiece, 0, 0)) {
                endRound();
            }
        }
    }

    private void endRound() {
        if (currentRound == Round.ROUND1) {
            player1Score = board.getScore();
            board.reset();
            currentRound = Round.ROUND2;
            spawnNewPiece();
            roundTransition = true;
        } else if (currentRound == Round.ROUND2) {
            player2Score = board.getScore();
            currentRound = Round.FINISHED;
            roundTransition = true;
        }
    }

    public void tick() {
        if (!gameStarted || currentRound == Round.FINISHED) return;
        if (!moveDown()) {
            lockAndSpawn();
        }
    }

    public Role getPlayer1Role() {
        return currentRound == Round.ROUND1 ? Role.PLACEMENT : Role.SABOTAGE;
    }

    public Role getPlayer2Role() {
        return currentRound == Round.ROUND2 ? Role.PLACEMENT : Role.SABOTAGE;
    }

    public String getWinner() {
        if (currentRound != Round.FINISHED) return null;
        if (player1Score > player2Score) return "Player 1";
        if (player2Score > player1Score) return "Player 2";
        return "Draw";
    }

    // Getters
    public Board getBoard() { return board; }
    public Piece getCurrentPiece() { return currentPiece; }
    public Piece getNextPiece() { return nextPiece; }
    public Round getCurrentRound() { return currentRound; }
    public boolean isGameStarted() { return gameStarted; }
    public boolean isRoundTransition() { return roundTransition; }
    public int getPlayer1Score() { return player1Score; }
    public int getPlayer2Score() { return player2Score; }

    public void clearRoundTransition() { roundTransition = false; }
}
