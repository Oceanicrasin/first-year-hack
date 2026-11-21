package game;

public class Piece {
    private Tetromino type;
    private int[][] shape;
    private int x;
    private int y;

    public Piece(Tetromino type) {
        this.type = type;
        this.shape = type.getShape();
        this.x = 5;
        this.y = 0;
    }

    public Tetromino getType() { return type; }
    public int[][] getShape() { return shape; }
    public int getX() { return x; }
    public int getY() { return y; }
    public String getColor() { return type.getColor(); }

    public void rotate() {
        int[][] rotated = new int[shape[0].length][shape.length];
        for (int i = 0; i < shape.length; i++) {
            for (int j = 0; j < shape[i].length; j++) {
                rotated[j][shape.length - 1 - i] = shape[i][j];
            }
        }
        this.shape = rotated;
    }

    public void moveX(int dx) { this.x += dx; }
    public void moveY(int dy) { this.y += dy; }
}
