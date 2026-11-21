package game;

import java.util.ArrayList;
import java.util.List;

public class Board {
    public static final int WIDTH = 10;
    public static final int HEIGHT = 20;
    private String[][] grid;
    private int score;
    private int linesCleared;
    private boolean gameOver;

    public Board() {
        grid = new String[HEIGHT][WIDTH];
        for (int i = 0; i < HEIGHT; i++) {
            for (int j = 0; j < WIDTH; j++) {
                grid[i][j] = null;
            }
        }
        score = 0;
        linesCleared = 0;
        gameOver = false;
    }

    public String[][] getGrid() { return grid; }
    public int getScore() { return score; }
    public int getLinesCleared() { return linesCleared; }
    public boolean isGameOver() { return gameOver; }

    public boolean isValidPosition(Piece piece, int dx, int dy) {
        int[][] shape = piece.getShape();
        for (int i = 0; i < shape.length; i++) {
            for (int j = 0; j < shape[i].length; j++) {
                if (shape[i][j] == 1) {
                    int newX = piece.getX() + j + dx;
                    int newY = piece.getY() + i + dy;
                    if (newX < 0 || newX >= WIDTH || newY >= HEIGHT) return false;
                    if (newY >= 0 && grid[newY][newX] != null) return false;
                }
            }
        }
        return true;
    }

    public boolean isValidRotation(Piece piece, int[][] newShape) {
        return isValidRotationWithOffset(piece, newShape, 0, 0);
    }

    public boolean isValidRotationWithOffset(Piece piece, int[][] newShape, int dx, int dy) {
        for (int i = 0; i < newShape.length; i++) {
            for (int j = 0; j < newShape[i].length; j++) {
                if (newShape[i][j] == 1) {
                    int newX = piece.getX() + j + dx;
                    int newY = piece.getY() + i + dy;
                    if (newX < 0 || newX >= WIDTH || newY >= HEIGHT) return false;
                    if (newY >= 0 && grid[newY][newX] != null) return false;
                }
            }
        }
        return true;
    }

    public void lockPiece(Piece piece) {
        int[][] shape = piece.getShape();
        for (int i = 0; i < shape.length; i++) {
            for (int j = 0; j < shape[i].length; j++) {
                if (shape[i][j] == 1) {
                    int x = piece.getX() + j;
                    int y = piece.getY() + i;
                    if (y >= 0 && y < HEIGHT && x >= 0 && x < WIDTH) {
                        grid[y][x] = piece.getColor();
                    }
                }
            }
        }
        clearLines();
        checkGameOver();
    }

    private void clearLines() {
        List<Integer> linesToClear = new ArrayList<>();
        for (int i = 0; i < HEIGHT; i++) {
            boolean full = true;
            for (int j = 0; j < WIDTH; j++) {
                if (grid[i][j] == null) {
                    full = false;
                    break;
                }
            }
            if (full) linesToClear.add(i);
        }

        for (int line : linesToClear) {
            for (int i = line; i > 0; i--) {
                System.arraycopy(grid[i - 1], 0, grid[i], 0, WIDTH);
            }
            for (int j = 0; j < WIDTH; j++) {
                grid[0][j] = null;
            }
        }

        int count = linesToClear.size();
        linesCleared += count;
        int[] points = {0, 100, 300, 500, 800};
        score += points[Math.min(count, 4)];
    }

    private void checkGameOver() {
        for (int j = 0; j < WIDTH; j++) {
            if (grid[0][j] != null) {
                gameOver = true;
                return;
            }
        }
    }

    public void reset() {
        for (int i = 0; i < HEIGHT; i++) {
            for (int j = 0; j < WIDTH; j++) {
                grid[i][j] = null;
            }
        }
        score = 0;
        linesCleared = 0;
        gameOver = false;
    }
}
