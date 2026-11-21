package game;

import java.util.Arrays;

public enum Tetromino {
    I(new int[][]{{0,0,0,0},{1,1,1,1},{0,0,0,0},{0,0,0,0}}, "#00f0f0"),
    O(new int[][]{{1,1},{1,1}}, "#f0f000"),
    T(new int[][]{{0,1,0},{1,1,1},{0,0,0}}, "#a000f0"),
    S(new int[][]{{0,1,1},{1,1,0},{0,0,0}}, "#00f000"),
    Z(new int[][]{{1,1,0},{0,1,1},{0,0,0}}, "#f00000"),
    J(new int[][]{{1,0,0},{1,1,1},{0,0,0}}, "#0000f0"),
    L(new int[][]{{0,0,1},{1,1,1},{0,0,0}}, "#f0a000");

    private final int[][] shape;
    private final String color;

    Tetromino(int[][] shape, String color) {
        this.shape = shape;
        this.color = color;
    }

    public int[][] getShape() {
        return shape;
    }

    public String getColor() {
        return color;
    }

    public static Tetromino random() {
        Tetromino[] values = values();
        return values[(int)(Math.random() * values.length)];
    }
}
