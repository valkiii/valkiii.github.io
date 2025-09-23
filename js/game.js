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
            // Initialize the Hugging Face AI (actual models)
            if (window.Connect4HuggingFaceAI) {
                // Your actual HF Space URL
                const hfSpaceUrl = "https://drbayes-connect4-tournament-ai.hf.space";
                this.realAI = new window.Connect4HuggingFaceAI(hfSpaceUrl);
                console.log('🤗 Hugging Face AI initialized - connecting to actual tournament models');
                
                // Wait for availability check and manually verify
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                // Manual health check to work around cached JS issue
                try {
                    const response = await fetch(`${hfSpaceUrl}/health`);
                    if (response.ok) {
                        const healthData = await response.json();
                        if (healthData.ai_loaded) {
                            this.realAI.isAvailable = true;
                            console.log('✅ Manual health check confirmed: AI is loaded');
                            console.log('🏆 Tournament AI active:', healthData.ai_type);
                        }
                    }
                } catch (error) {
                    console.warn('Manual health check failed:', error);
                }
                
                this.updateAIStatus('Hugging Face AI');
            } else {
                console.error('❌ Connect4HuggingFaceAI class not found');
                this.updateAIStatus('Hugging Face AI Required (Not Found)');
                this.gameActive = false;
                alert('⚠️ Hugging Face AI components not loaded');
            }
        } catch (error) {
            console.error('❌ Error initializing AI:', error);
            this.updateAIStatus('AI Error');
            this.gameActive = false;
        }
    }
    
    updateAIStatus(status) {
        // Update AI info in the UI
        const aiInfo = document.querySelector('.ai-info');
        if (aiInfo) {
            const statusElement = aiInfo.querySelector('.ai-status') || document.createElement('div');
            statusElement.className = 'ai-status';
            statusElement.style.fontSize = '1rem';
            statusElement.style.fontWeight = 'bold';
            statusElement.style.padding = '8px 12px';
            statusElement.style.borderRadius = '6px';
            statusElement.style.marginTop = '10px';
            statusElement.style.textAlign = 'center';
            
            // Set colors and icons based on AI type
            const isHuggingFaceAI = this.realAI && this.realAI.isAvailable;
            if (isHuggingFaceAI) {
                statusElement.style.backgroundColor = '#d4edda';
                statusElement.style.color = '#155724';
                statusElement.style.border = '1px solid #c3e6cb';
                statusElement.innerHTML = `🤗 <strong>REAL AI ENSEMBLE LIVE</strong><br><small>Playing against actual tournament-winning neural networks</small>`;
            } else {
                statusElement.style.backgroundColor = '#fff3cd';
                statusElement.style.color = '#856404';
                statusElement.style.border = '1px solid #ffeaa7';
                statusElement.innerHTML = `🤗 <strong>CONNECTING TO HUGGING FACE...</strong><br><small>Loading tournament AI ensemble</small>`;
            }
            
            if (!aiInfo.querySelector('.ai-status')) {
                aiInfo.appendChild(statusElement);
            }
        }
        
        // Also update the current player indicator during AI moves
        this.updatePlayerIndicatorWithAIType();
    }
    
    updatePlayerIndicatorWithAIType() {
        const indicator = document.getElementById('player-indicator');
        if (indicator && this.currentPlayer === 2 && this.gameActive) {
            const isHuggingFaceAI = this.realAI && this.realAI.isAvailable;
            if (isHuggingFaceAI) {
                indicator.innerHTML = '🤗 Real AI ensemble thinking... <span class="ai-thinking">●●●</span>';
            } else {
                indicator.innerHTML = '🤗 Connecting to Hugging Face...';
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
            // Get AI move from real AI only
            const validMoves = this.getValidMoves();
            let aiMove;
            
            if (this.realAI && this.realAI.isAvailable) {
                aiMove = await this.realAI.chooseMove(this.board, validMoves);
                console.log('🤗 REAL AI ENSEMBLE move:', aiMove + 1, '- Decision from actual tournament-winning models');
            } else {
                console.error('❌ Hugging Face AI not available for move');
                this.gameActive = false;
                alert('⚠️ Unable to connect to Hugging Face AI. Please check your internet connection.');
                return;
            }
            
            if (aiMove !== null && aiMove !== undefined) {
                // Small delay to show thinking
                const delay = 500;
                await new Promise(resolve => setTimeout(resolve, delay));
                this.makeMove(aiMove, 2);
            }
            
        } catch (error) {
            console.error('❌ Error in AI move:', error);
            this.gameActive = false;
            alert('⚠️ AI error occurred. Game stopped.');
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
        indicator.className = 'current-player ai-turn';
        this.updatePlayerIndicatorWithAIType();
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
            
            // Get hint from Hugging Face AI
            if (this.realAI && this.realAI.isAvailable) {
                hintResult = await this.realAI.getHint(this.board, validMoves);
                console.log('💡 Real AI ensemble hint:', hintResult);
            } else {
                alert('⚠️ Hints require connection to the Hugging Face AI ensemble.');
                return;
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
            alert('⚠️ Error getting hint from AI.');
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