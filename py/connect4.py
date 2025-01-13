import random
import numpy as np
import matplotlib.pyplot as plt
from IPython.display import display, clear_output
import ipywidgets as widgets
%matplotlib inline

class Connect4:
    def __init__(self, rows=6, columns=7):
        self.rows = rows
        self.columns = columns
        self.board = np.zeros((rows, columns), dtype=int)
        self.current_player = 1  # 1 for Yellow, 2 for Red
        self.game_over = False
        self.winner = None

    def make_move(self, column):
        if self.game_over or column < 0 or column >= self.columns:
            return False
        
        for row in range(self.rows - 1, -1, -1):
            if self.board[row, column] == 0:
                self.board[row, column] = self.current_player
                self.check_win(row, column)
                self.current_player = 3 - self.current_player  # Switch player (1 -> 2, 2 -> 1)
                return True
        
        return False

    def check_win(self, row, col):
        if self.check_line(row, col, 0, 1) or self.check_line(row, col, 1, 0) or \
           self.check_line(row, col, 1, 1) or self.check_line(row, col, 1, -1):
            self.game_over = True
            self.winner = 'Yellow' if self.current_player == 1 else 'Red'

    def check_line(self, row, col, row_step, col_step):
        player = self.board[row, col]
        count = 0
        for i in range(-3, 4):
            r, c = row + i * row_step, col + i * col_step
            if 0 <= r < self.rows and 0 <= c < self.columns and self.board[r, c] == player:
                count += 1
                if count == 4:
                    return True
            else:
                count = 0
        return False

    def is_full(self):
        return np.all(self.board != 0)

    def reset(self):
        self.__init__(self.rows, self.columns)

    def display(self):
        plt.figure(figsize=(10, 8))
        cmap = plt.cm.coolwarm
        cmap.set_bad('white')
        masked_board = np.ma.masked_where(self.board == 0, self.board)
        plt.imshow(masked_board, cmap=cmap, vmin=0.5, vmax=2.5)
        for i in range(self.rows):
            for j in range(self.columns):
                color = 'yellow' if self.board[i, j] == 1 else 'red' if self.board[i, j] == 2 else 'black'
                plt.text(j, i, ['', 'Y', 'R'][self.board[i, j]], ha='center', va='center', color=color, fontsize=20, fontweight='bold')
        plt.xticks(range(self.columns))
        plt.yticks(range(self.rows))
        plt.grid()
        plt.title(f"Current Player: {'Yellow' if self.current_player == 1 else 'Red'}")
        plt.close()  # Close the figure to prevent display
        return plt.gcf()  # Return the figure

class AIPlayer:
    def make_move(self, game):
        valid_moves = [col for col in range(game.columns) if game.board[0, col] == 0]
        return random.choice(valid_moves) if valid_moves else None

def create_button(column):
    return widgets.Button(description=str(column), layout=widgets.Layout(width='40px', height='30px'))

def play_game(game, player_types):
    output = widgets.Output()
    buttons = [create_button(i) for i in range(game.columns)]
    button_box = widgets.HBox(buttons)
    
    def update_display():
        with output:
            clear_output(wait=True)
            display(game.display())
            if game.game_over:
                print(f"Player {game.winner} wins!")
                for btn in buttons:
                    btn.disabled = True
            elif game.is_full():
                print("It's a draw!")
                for btn in buttons:
                    btn.disabled = True
            else:
                current_player = 'Yellow' if game.current_player == 1 else 'Red'
                print(f"Current player: {current_player}")

    def make_ai_move():
        ai_player = AIPlayer()
        ai_column = ai_player.make_move(game)
        game.make_move(ai_column)
        print(f"AI moved in column {ai_column}")
        update_display()

    def on_button_clicked(b):
        with output:
            column = int(b.description)
            if game.make_move(column):
                update_display()
                if not game.game_over and not game.is_full():
                    if player_types['Red'] == 'AI':
                        make_ai_move()
            else:
                print("Invalid move, try again.")

    for button in buttons:
        button.on_click(on_button_clicked)

    display(button_box)
    display(output)
    
    update_display()

# Example usage
game = Connect4()
# player_types = {'Yellow': 'Human', 'Red': 'AI'}  # You can change 'Human' to 'AI' for AI vs AI game
# play_game(game, player_types)