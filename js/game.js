/**
 * Connect 4 Game Logic - Web Implementation
 * Integrates with the Custom-Ensemble-Top5Models-q AI
 */

class Connect4Game {
    constructor() {
        this.board = Array(6).fill().map(() => Array(7).fill(0));
        this.currentPlayer = 1; // 1 = human, 2 = AI
        this.gameActive = true;
        
        // Initialize AI systems with fallback
        this.fallbackAI = null;
        this.realAI = null;
        
        this.moveHistory = [];
        this.stats = this.loadStats();
        
        this.initializeBoard();
        this.updateUI();
        this.initializeAI();
    }
    
    async initializeAI() {
        try {
            // Initialize fallback AI first
            if (window.Connect4AI) {
                this.fallbackAI = new window.Connect4AI();
                console.log('✅ Fallback AI initialized');
            } else {
                console.error('❌ Connect4AI class not found');
                return;
            }
            
            // Try to initialize real AI if available
            if (window.Connect4RealAI) {
                this.realAI = new window.Connect4RealAI();
                // Wait a moment for the real AI to check availability
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                if (this.realAI.isAvailable) {
                    console.log('✅ Using real AI ensemble with actual .pt models');
                    this.updateAIStatus('Real AI Ensemble Active');
                } else {
                    console.log('🎲 Using fallback heuristic AI');
                    this.updateAIStatus('Heuristic AI (API not available)');
                }
            } else {
                console.log('🎲 Using fallback heuristic AI (RealAI not available)');
                this.updateAIStatus('Heuristic AI');
            }
        } catch (error) {
            console.error('❌ Error initializing AI:', error);
            this.updateAIStatus('AI Error');
        }
    }
    
    updateAIStatus(status) {
        // Update AI info in the UI
        const aiInfo = document.querySelector('.ai-info');
        if (aiInfo) {
            const statusElement = aiInfo.querySelector('.ai-status') || document.createElement('p');
            statusElement.className = 'ai-status';
            statusElement.style.fontSize = '0.9rem';
            statusElement.style.fontStyle = 'italic';
            statusElement.style.color = this.realAI.isAvailable ? '#27ae60' : '#f39c12';
            statusElement.textContent = `Status: ${status}`;
            
            if (!aiInfo.querySelector('.ai-status')) {
                aiInfo.appendChild(statusElement);
            }
        }
    }
    
    initializeBoard() {
        const boardElement = document.getElementById('game-board');
        boardElement.innerHTML = '';
        
        // Create cells (top to bottom, left to right)
        for (let row = 0; row < 6; row++) {
            for (let col = 0; col < 7; col++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.row = row;
                cell.dataset.col = col;
                cell.addEventListener('click', () => this.handleCellClick(col));
                boardElement.appendChild(cell);
            }
        }
    }
    
    handleCellClick(col) {
        if (!this.gameActive || this.currentPlayer !== 1) return;
        
        const validMoves = this.getValidMoves();
        if (!validMoves.includes(col)) return;
        
        this.makeMove(col, 1);
        
        if (this.gameActive && this.currentPlayer === 2) {
            // Small delay for AI thinking effect
            setTimeout(() => this.makeAIMove(), 500);
        }
    }
    
    makeMove(col, player) {
        const row = this.getDropRow(col);
        if (row === -1) return false;
        
        this.board[row][col] = player;
        this.moveHistory.push({
            player: player,
            col: col,
            row: row,
            move: this.moveHistory.length + 1
        });
        
        this.animateMove(row, col, player);
        this.updateMoveLog();
        
        if (this.checkWin(row, col, player)) {
            this.endGame(player);
            return true;
        }
        
        if (this.isBoardFull()) {
            this.endGame(0); // Draw
            return true;
        }
        
        this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
        this.updateUI();
        return true;
    }
    
    async makeAIMove() {
        if (!this.gameActive || this.currentPlayer !== 2) return;
        
        this.showAIThinking();
        
        try {
            // Get AI move from real AI or fallback
            const validMoves = this.getValidMoves();
            let aiMove;
            
            if (this.realAI && this.realAI.isAvailable) {
                aiMove = await this.realAI.chooseMove(this.board, validMoves);
                console.log('🤖 Real AI move:', aiMove + 1);
            } else if (this.fallbackAI) {
                aiMove = this.fallbackAI.chooseMove(this.board, validMoves);
                console.log('🎲 Fallback AI move:', aiMove + 1);
            } else {
                // Emergency fallback - random move
                aiMove = validMoves[Math.floor(Math.random() * validMoves.length)];
                console.log('🎯 Random move:', aiMove + 1);
            }
            
            if (aiMove !== null && aiMove !== undefined) {
                // Small delay to show thinking (shorter for real AI since it's already delayed by network)
                const delay = (this.realAI && this.realAI.isAvailable) ? 300 : 800;
                await new Promise(resolve => setTimeout(resolve, delay));
                this.makeMove(aiMove, 2);
            }
            
        } catch (error) {
            console.error('❌ Error in AI move:', error);
            // Emergency fallback
            const validMoves = this.getValidMoves();
            let emergencyMove;
            if (this.fallbackAI) {
                emergencyMove = this.fallbackAI.chooseMove(this.board, validMoves);
            } else {
                emergencyMove = validMoves[Math.floor(Math.random() * validMoves.length)];
            }
            this.makeMove(emergencyMove, 2);
        }
        
        this.hideAIThinking();
    }
    
    getValidMoves() {
        const moves = [];
        for (let col = 0; col < 7; col++) {
            if (this.board[0][col] === 0) {
                moves.push(col);
            }
        }
        return moves;
    }
    
    getDropRow(col) {
        for (let row = 5; row >= 0; row--) {
            if (this.board[row][col] === 0) {
                return row;
            }
        }
        return -1;
    }
    
    checkWin(row, col, player) {
        const directions = [
            [0, 1],  // horizontal
            [1, 0],  // vertical
            [1, 1],  // diagonal /
            [1, -1]  // diagonal \\
        ];
        
        for (const [dr, dc] of directions) {
            let count = 1; // Count the piece we just placed
            const winningPositions = [{row, col}];
            
            // Check positive direction
            for (let i = 1; i < 4; i++) {
                const newRow = row + dr * i;
                const newCol = col + dc * i;
                if (newRow < 0 || newRow >= 6 || newCol < 0 || newCol >= 7) break;
                if (this.board[newRow][newCol] === player) {
                    count++;
                    winningPositions.push({row: newRow, col: newCol});
                } else break;
            }
            
            // Check negative direction
            for (let i = 1; i < 4; i++) {
                const newRow = row - dr * i;
                const newCol = col - dc * i;
                if (newRow < 0 || newRow >= 6 || newCol < 0 || newCol >= 7) break;
                if (this.board[newRow][newCol] === player) {
                    count++;
                    winningPositions.push({row: newRow, col: newCol});
                } else break;
            }
            
            if (count >= 4) {
                this.highlightWinningLine(winningPositions);
                return true;
            }
        }
        
        return false;
    }
    
    isBoardFull() {
        return this.board[0].every(cell => cell !== 0);
    }
    
    endGame(winner) {
        this.gameActive = false;
        
        if (winner === 1) {
            this.stats.playerWins++;
        } else if (winner === 2) {
            this.stats.aiWins++;
        } else {
            this.stats.draws++;
        }
        
        this.saveStats();
        this.updateStats();
        this.updateUI();
        
        // Show result message
        setTimeout(() => {
            let message;
            if (winner === 1) {
                message = "🎉 Congratulations! You beat the AI ensemble!";
            } else if (winner === 2) {
                message = "🤖 AI wins! The ensemble's strategic thinking paid off.";
            } else {
                message = "🤝 It's a draw! Great game against the AI ensemble.";
            }
            
            if (confirm(`${message}\n\nWould you like to play again?`)) {
                this.startNewGame();
            }
        }, 1000);
    }
    
    animateMove(row, col, player) {
        const boardElement = document.getElementById('game-board');
        const cellIndex = row * 7 + col;
        const cell = boardElement.children[cellIndex];
        
        cell.classList.add('dropping');
        cell.classList.add(player === 1 ? 'player1' : 'player2');
        
        setTimeout(() => {
            cell.classList.remove('dropping');
        }, 500);
    }
    
    highlightWinningLine(positions) {
        const boardElement = document.getElementById('game-board');
        
        positions.forEach(pos => {
            const cellIndex = pos.row * 7 + pos.col;
            const cell = boardElement.children[cellIndex];
            cell.classList.add('winning');
        });
    }
    
    showAIThinking() {
        const indicator = document.getElementById('player-indicator');
        indicator.innerHTML = 'AI is thinking... 🤖 <span class="ai-thinking">●●●</span>';
        indicator.className = 'current-player ai-turn';
    }
    
    hideAIThinking() {
        this.updateUI();
    }
    
    updateUI() {
        const indicator = document.getElementById('player-indicator');
        const hintBtn = document.getElementById('hint-btn');
        
        if (!this.gameActive) {
            indicator.innerHTML = 'Game Over';
            indicator.className = 'current-player';
            hintBtn.disabled = true;
        } else if (this.currentPlayer === 1) {
            indicator.innerHTML = 'Your turn! 🔴';
            indicator.className = 'current-player';
            hintBtn.disabled = false;
        } else {
            indicator.innerHTML = 'AI\'s turn 🟡';
            indicator.className = 'current-player ai-turn';
            hintBtn.disabled = true;
        }
    }
    
    updateMoveLog() {
        const moveLog = document.getElementById('move-log');
        const lastMove = this.moveHistory[this.moveHistory.length - 1];
        
        if (lastMove) {
            const playerName = lastMove.player === 1 ? 'You' : 'AI';
            const playerEmoji = lastMove.player === 1 ? '🔴' : '🟡';
            const moveEntry = document.createElement('div');
            moveEntry.innerHTML = `${lastMove.move}. ${playerName} ${playerEmoji} → Column ${lastMove.col + 1}`;
            moveLog.appendChild(moveEntry);
            moveLog.scrollTop = moveLog.scrollHeight;
        }
    }
    
    updateStats() {
        document.getElementById('player-wins').textContent = this.stats.playerWins;
        document.getElementById('ai-wins').textContent = this.stats.aiWins;
        document.getElementById('draws').textContent = this.stats.draws;
    }
    
    loadStats() {
        const saved = localStorage.getItem('connect4-stats');
        return saved ? JSON.parse(saved) : { playerWins: 0, aiWins: 0, draws: 0 };
    }
    
    saveStats() {
        localStorage.setItem('connect4-stats', JSON.stringify(this.stats));
    }
    
    startNewGame() {
        this.board = Array(6).fill().map(() => Array(7).fill(0));
        this.currentPlayer = 1;
        this.gameActive = true;
        this.moveHistory = [];
        
        this.initializeBoard();
        this.updateUI();
        
        // Clear move log
        document.getElementById('move-log').innerHTML = '';
    }
    
    async getHint() {
        if (!this.gameActive || this.currentPlayer !== 1) return;
        
        const validMoves = this.getValidMoves();
        if (validMoves.length === 0) return;
        
        try {
            let hintResult;
            
            // Get hint from real AI if available
            if (this.realAI && this.realAI.isAvailable) {
                hintResult = await this.realAI.getHint(this.board, validMoves);
                console.log('💡 Real AI hint:', hintResult);
            } else if (this.fallbackAI) {
                const suggestedMove = this.fallbackAI.chooseMove(this.board, validMoves);
                hintResult = {
                    move: suggestedMove,
                    explanation: `AI suggests column ${suggestedMove + 1}`,
                    confidence: 'medium'
                };
            } else {
                // Emergency fallback
                const suggestedMove = validMoves[Math.floor(Math.random() * validMoves.length)];
                hintResult = {
                    move: suggestedMove,
                    explanation: `Random suggestion: column ${suggestedMove + 1}`,
                    confidence: 'low'
                };
            }
            
            if (hintResult && hintResult.move !== null) {
                // Highlight the suggested column briefly
                this.highlightColumn(hintResult.move);
                
                // Show hint message
                const confidenceEmoji = hintResult.confidence === 'high' ? '💪' : 
                                      hintResult.confidence === 'medium' ? '👍' : '🤔';
                alert(`💡 ${confidenceEmoji} ${hintResult.explanation}`);
            }
            
        } catch (error) {
            console.error('❌ Error getting hint:', error);
            // Emergency fallback
            let suggestedMove;
            if (this.fallbackAI) {
                suggestedMove = this.fallbackAI.chooseMove(this.board, validMoves);
                this.highlightColumn(suggestedMove);
                alert(`💡 AI suggests column ${suggestedMove + 1} (fallback)`);
            } else {
                suggestedMove = validMoves[Math.floor(Math.random() * validMoves.length)];
                this.highlightColumn(suggestedMove);
                alert(`💡 Random suggestion: column ${suggestedMove + 1}`);
            }
        }
    }
    
    highlightColumn(col) {
        const boardElement = document.getElementById('game-board');
        for (let row = 0; row < 6; row++) {
            const cellIndex = row * 7 + col;
            const cell = boardElement.children[cellIndex];
            cell.style.backgroundColor = '#3498db';
            cell.style.opacity = '0.7';
            
            setTimeout(() => {
                cell.style.backgroundColor = '';
                cell.style.opacity = '';
            }, 2000);
        }
    }
}

// Global functions for HTML buttons
function startNewGame() {
    if (window.game) {
        window.game.startNewGame();
    }
}

function getHint() {
    if (window.game) {
        window.game.getHint();
    }
}

// Initialize game when page loads
document.addEventListener('DOMContentLoaded', function() {
    window.game = new Connect4Game();
    window.game.updateStats();
    
    // Add keyboard controls
    document.addEventListener('keydown', function(e) {
        if (!window.game.gameActive || window.game.currentPlayer !== 1) return;
        
        const key = e.key;
        if (key >= '1' && key <= '7') {
            const col = parseInt(key) - 1;
            window.game.handleCellClick(col);
        } else if (key === 'h' || key === 'H') {
            getHint();
        } else if (key === 'n' || key === 'N') {
            startNewGame();
        }
    });
    
    console.log('🎮 Connect 4 vs AI Ensemble loaded!');
    console.log('💡 Use keyboard shortcuts: 1-7 for columns, H for hint, N for new game');
});