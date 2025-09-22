/**
 * Connect 4 AI Ensemble - Web Implementation
 * Based on Custom-Ensemble-Top5Models-q configuration
 * 
 * This AI simulates the behavior of 5 trained CNN models:
 * - M1-CNN-750k (weight: 0.3)
 * - M1-CNN-700k (weight: 0.2)  
 * - M1-CNN-650k (weight: 0.2)
 * - M1-CNN-600k (weight: 0.15)
 * - M1-CNN-550k (weight: 0.15)
 * 
 * Uses Q-value averaging ensemble method
 */

class Connect4AI {
    constructor() {
        this.models = [
            { name: 'M1-CNN-750k', weight: 0.3, episodes: 750000 },
            { name: 'M1-CNN-700k', weight: 0.2, episodes: 700000 },
            { name: 'M1-CNN-650k', weight: 0.2, episodes: 650000 },
            { name: 'M1-CNN-600k', weight: 0.15, episodes: 600000 },
            { name: 'M1-CNN-550k', weight: 0.15, episodes: 550000 }
        ];
        
        // Pre-computed strategic patterns and weights
        this.centerColumnBonus = 0.1;
        this.winningMoveBonus = 1.0;
        this.blockingMoveBonus = 0.8;
        this.forkBonus = 0.6;
        this.threatBonus = 0.4;
        
        // Difficulty scaling based on training episodes
        this.difficultyScale = {
            750000: 0.95, // Strongest model
            700000: 0.90,
            650000: 0.85,
            600000: 0.80,
            550000: 0.75  // Weakest but still strong
        };
    }
    
    /**
     * Main AI decision function - implements Q-value averaging
     */
    chooseMove(board, validMoves) {
        if (validMoves.length === 0) return null;
        if (validMoves.length === 1) return validMoves[0];
        
        // Get Q-values from each model
        const modelQValues = this.models.map(model => 
            this.getModelQValues(board, validMoves, model)
        );
        
        // Apply weighted averaging
        const ensembleQValues = this.averageQValues(modelQValues);
        
        // Add some randomness to prevent completely deterministic play
        const temperature = 0.1;
        const scaledQValues = ensembleQValues.map(q => q / temperature);
        const probabilities = this.softmax(scaledQValues);
        
        // Sample from probability distribution
        return this.sampleFromProbabilities(validMoves, probabilities);
    }
    
    /**
     * Simulate Q-values for a specific model based on strategic analysis
     */
    getModelQValues(board, validMoves, model) {
        const qValues = [];
        const difficulty = this.difficultyScale[model.episodes];
        
        for (const move of validMoves) {
            let qValue = 0.0;
            
            // Simulate board after move
            const tempBoard = this.simulateMove(board, move, 2); // AI is player 2
            
            // Strategic evaluations (simulating CNN pattern recognition)
            qValue += this.evaluateWinningMove(tempBoard, move, 2) * this.winningMoveBonus;
            qValue += this.evaluateBlockingMove(board, move, 1) * this.blockingMoveBonus;
            qValue += this.evaluateCenterColumn(move) * this.centerColumnBonus;
            qValue += this.evaluateThreats(tempBoard, 2) * this.threatBonus;
            qValue += this.evaluateForks(tempBoard, move, 2) * this.forkBonus;
            qValue += this.evaluatePositional(tempBoard, move) * 0.3;
            qValue += this.evaluateFutureThreats(tempBoard, 2) * 0.2;
            
            // Model-specific variations (simulating different learned patterns)
            qValue += this.getModelSpecificBias(model, board, move);
            
            // Apply difficulty scaling
            qValue *= difficulty;
            
            // Add small random noise to break ties
            qValue += (Math.random() - 0.5) * 0.01;
            
            qValues.push(qValue);
        }
        
        return qValues;
    }
    
    /**
     * Weighted average of Q-values from all models
     */
    averageQValues(modelQValues) {
        const numMoves = modelQValues[0].length;
        const ensembleQValues = new Array(numMoves).fill(0);
        
        for (let i = 0; i < numMoves; i++) {
            for (let j = 0; j < this.models.length; j++) {
                ensembleQValues[i] += modelQValues[j][i] * this.models[j].weight;
            }
        }
        
        return ensembleQValues;
    }
    
    /**
     * Check if move results in immediate win
     */
    evaluateWinningMove(board, col, player) {
        const row = this.getDropRow(board, col);
        if (row === -1) return 0;
        
        const tempBoard = JSON.parse(JSON.stringify(board));
        tempBoard[row][col] = player;
        
        return this.checkWin(tempBoard, row, col, player) ? 1.0 : 0.0;
    }
    
    /**
     * Check if move blocks opponent's winning move
     */
    evaluateBlockingMove(board, col, opponent) {
        const row = this.getDropRow(board, col);
        if (row === -1) return 0;
        
        const tempBoard = JSON.parse(JSON.stringify(board));
        tempBoard[row][col] = opponent;
        
        return this.checkWin(tempBoard, row, col, opponent) ? 1.0 : 0.0;
    }
    
    /**
     * Bonus for center column (strategic advantage)
     */
    evaluateCenterColumn(col) {
        return col === 3 ? 1.0 : Math.max(0, 1.0 - Math.abs(col - 3) * 0.2);
    }
    
    /**
     * Count threats (3 in a row with one empty)
     */
    evaluateThreats(board, player) {
        let threats = 0;
        const directions = [[0,1], [1,0], [1,1], [1,-1]];
        
        for (let row = 0; row < 6; row++) {
            for (let col = 0; col < 7; col++) {
                if (board[row][col] === 0) {
                    for (const [dr, dc] of directions) {
                        if (this.countInDirection(board, row, col, dr, dc, player) >= 2) {
                            threats += 0.5;
                        }
                    }
                }
            }
        }
        
        return threats;
    }
    
    /**
     * Evaluate potential forks (multiple threat opportunities)
     */
    evaluateForks(board, col, player) {
        const row = this.getDropRow(board, col);
        if (row === -1) return 0;
        
        let forkValue = 0;
        const directions = [[0,1], [1,0], [1,1], [1,-1]];
        
        for (const [dr, dc] of directions) {
            const count = this.countInDirection(board, row, col, dr, dc, player);
            if (count >= 2) forkValue += 0.3;
        }
        
        return forkValue;
    }
    
    /**
     * General positional evaluation
     */
    evaluatePositional(board, col) {
        const row = this.getDropRow(board, col);
        if (row === -1) return 0;
        
        let positional = 0;
        
        // Prefer lower rows
        positional += (5 - row) * 0.1;
        
        // Avoid edges slightly
        positional += Math.max(0, 1.0 - Math.abs(col - 3) * 0.1);
        
        // Check for building on existing pieces
        if (row < 5 && board[row + 1][col] !== 0) {
            positional += 0.2;
        }
        
        return positional;
    }
    
    /**
     * Look ahead for future threats
     */
    evaluateFutureThreats(board, player) {
        let futureValue = 0;
        
        // Simple 1-move lookahead for creating multiple threats
        for (let col = 0; col < 7; col++) {
            const row = this.getDropRow(board, col);
            if (row !== -1) {
                const tempBoard = JSON.parse(JSON.stringify(board));
                tempBoard[row][col] = player;
                
                const threats = this.evaluateThreats(tempBoard, player);
                if (threats > 1) futureValue += 0.3;
            }
        }
        
        return futureValue;
    }
    
    /**
     * Model-specific biases (simulating different learned preferences)
     */
    getModelSpecificBias(model, board, col) {
        const episodes = model.episodes;
        
        // Higher episode models prefer more aggressive play
        if (episodes >= 700000) {
            return this.evaluateAggressive(board, col) * 0.2;
        }
        
        // Lower episode models prefer safer play
        if (episodes <= 600000) {
            return this.evaluateDefensive(board, col) * 0.2;
        }
        
        return 0;
    }
    
    evaluateAggressive(board, col) {
        // Prefer moves that create multiple threats
        const row = this.getDropRow(board, col);
        if (row === -1) return 0;
        
        let aggression = 0;
        if (col >= 1 && col <= 5) aggression += 0.1; // Avoid extreme edges
        if (row <= 2) aggression += 0.1; // Prefer higher positions for threats
        
        return aggression;
    }
    
    evaluateDefensive(board, col) {
        // Prefer moves that maintain solid structure
        const row = this.getDropRow(board, col);
        if (row === -1) return 0;
        
        let defense = 0;
        if (row >= 3) defense += 0.1; // Prefer lower, more stable positions
        if (col >= 2 && col <= 4) defense += 0.1; // Prefer center columns
        
        return defense;
    }
    
    /**
     * Utility functions
     */
    simulateMove(board, col, player) {
        const row = this.getDropRow(board, col);
        if (row === -1) return null;
        
        const newBoard = JSON.parse(JSON.stringify(board));
        newBoard[row][col] = player;
        return newBoard;
    }
    
    getDropRow(board, col) {
        for (let row = 5; row >= 0; row--) {
            if (board[row][col] === 0) return row;
        }
        return -1;
    }
    
    countInDirection(board, row, col, dr, dc, player) {
        let count = 0;
        
        // Count in positive direction
        for (let i = 1; i < 4; i++) {
            const newRow = row + dr * i;
            const newCol = col + dc * i;
            if (newRow < 0 || newRow >= 6 || newCol < 0 || newCol >= 7) break;
            if (board[newRow][newCol] === player) count++;
            else break;
        }
        
        // Count in negative direction
        for (let i = 1; i < 4; i++) {
            const newRow = row - dr * i;
            const newCol = col - dc * i;
            if (newRow < 0 || newRow >= 6 || newCol < 0 || newCol >= 7) break;
            if (board[newRow][newCol] === player) count++;
            else break;
        }
        
        return count;
    }
    
    checkWin(board, row, col, player) {
        const directions = [[0,1], [1,0], [1,1], [1,-1]];
        
        for (const [dr, dc] of directions) {
            let count = 1; // Count the piece we just placed
            
            // Count in positive direction
            for (let i = 1; i < 4; i++) {
                const newRow = row + dr * i;
                const newCol = col + dc * i;
                if (newRow < 0 || newRow >= 6 || newCol < 0 || newCol >= 7) break;
                if (board[newRow][newCol] === player) count++;
                else break;
            }
            
            // Count in negative direction
            for (let i = 1; i < 4; i++) {
                const newRow = row - dr * i;
                const newCol = col - dc * i;
                if (newRow < 0 || newRow >= 6 || newCol < 0 || newCol >= 7) break;
                if (board[newRow][newCol] === player) count++;
                else break;
            }
            
            if (count >= 4) return true;
        }
        
        return false;
    }
    
    softmax(values) {
        const maxVal = Math.max(...values);
        const exps = values.map(v => Math.exp(v - maxVal));
        const sumExps = exps.reduce((a, b) => a + b, 0);
        return exps.map(exp => exp / sumExps);
    }
    
    sampleFromProbabilities(moves, probabilities) {
        const random = Math.random();
        let cumulative = 0;
        
        for (let i = 0; i < moves.length; i++) {
            cumulative += probabilities[i];
            if (random <= cumulative) {
                return moves[i];
            }
        }
        
        return moves[moves.length - 1];
    }
}

// Export for use in game.js
window.Connect4AI = Connect4AI;