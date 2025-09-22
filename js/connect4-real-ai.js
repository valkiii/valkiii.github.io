/**
 * Connect 4 Real AI - Web Implementation
 * Communicates with Flask API serving actual .pt models
 * 
 * This connects to the Python backend running your actual
 * Custom-Ensemble-Top5Models-q configuration with real CNN models.
 */

class Connect4RealAI {
    constructor(apiUrl = 'http://localhost:5001') {
        this.apiUrl = apiUrl;
        this.isAvailable = false;
        this.modelInfo = null;
        this.lastDecision = null;
        
        // Check if API is available
        this.checkApiHealth();
    }
    
    async checkApiHealth() {
        try {
            const response = await fetch(`${this.apiUrl}/`);
            const data = await response.json();
            
            if (data.status === 'healthy' && data.ensemble_loaded) {
                this.isAvailable = true;
                console.log('✅ Real AI API is available!');
                console.log('📊 Model info:', data.model_info);
                
                // Get detailed ensemble info
                await this.loadEnsembleInfo();
            } else {
                console.warn('⚠️ AI API is running but ensemble not loaded');
                this.isAvailable = false;
            }
        } catch (error) {
            console.warn('⚠️ Real AI API not available, falling back to heuristic AI');
            console.warn('Error:', error.message);
            this.isAvailable = false;
        }
    }
    
    async loadEnsembleInfo() {
        try {
            const response = await fetch(`${this.apiUrl}/api/ensemble/info`);
            const data = await response.json();
            this.modelInfo = data.ensemble_info;
            
            console.log('🧠 Ensemble Details:');
            console.log('   Method:', this.modelInfo.ensemble_method);
            console.log('   Models:', this.modelInfo.num_models);
            this.modelInfo.models.forEach((model, i) => {
                console.log(`   ${i+1}. ${model.name} (weight: ${model.weight})`);
            });
        } catch (error) {
            console.error('Failed to load ensemble info:', error);
        }
    }
    
    /**
     * Get AI move from the real ensemble
     */
    async chooseMove(board, validMoves) {
        if (!this.isAvailable) {
            // Fallback to simple heuristic
            return this.fallbackMove(board, validMoves);
        }
        
        try {
            const response = await fetch(`${this.apiUrl}/api/game/move`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    board: board
                })
            });
            
            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }
            
            const data = await response.json();
            
            // Store decision details for analysis
            this.lastDecision = {
                move: data.move,
                method: data.ensemble_method,
                modelCount: data.model_count,
                legalMoves: data.legal_moves,
                breakdown: data.decision_breakdown,
                details: data.move_details
            };
            
            // Log decision info for debugging
            if (window.DEBUG_AI) {
                console.log('🤖 Real AI Decision:');
                console.log('   Move:', data.move + 1);
                console.log('   Method:', data.ensemble_method);
                console.log('   Models:', data.model_count);
                console.log('   Legal moves:', data.legal_moves);
                if (data.move_details && data.move_details.q_values) {
                    console.log('   Q-values:', data.move_details.q_values);
                }
            }
            
            return data.move;
            
        } catch (error) {
            console.error('❌ Error getting AI move from API:', error);
            console.log('🔄 Falling back to heuristic AI');
            
            // Fallback to heuristic
            this.isAvailable = false;
            return this.fallbackMove(board, validMoves);
        }
    }
    
    /**
     * Get move hint for human player
     */
    async getHint(board, validMoves) {
        if (!this.isAvailable) {
            return this.fallbackHint(board, validMoves);
        }
        
        try {
            const response = await fetch(`${this.apiUrl}/api/game/hint`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    board: board
                })
            });
            
            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }
            
            const data = await response.json();
            return {
                move: data.hint_move,
                explanation: data.explanation,
                confidence: data.confidence
            };
            
        } catch (error) {
            console.error('❌ Error getting hint from API:', error);
            return this.fallbackHint(board, validMoves);
        }
    }
    
    /**
     * Get detailed position evaluation
     */
    async evaluatePosition(board) {
        if (!this.isAvailable) {
            return null;
        }
        
        try {
            const response = await fetch(`${this.apiUrl}/api/game/evaluate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    board: board
                })
            });
            
            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }
            
            const data = await response.json();
            return data;
            
        } catch (error) {
            console.error('❌ Error evaluating position:', error);
            return null;
        }
    }
    
    /**
     * Get detailed decision breakdown
     */
    getLastDecisionBreakdown() {
        if (!this.lastDecision) return null;
        return this.lastDecision.breakdown;
    }
    
    /**
     * Get model information
     */
    getModelInfo() {
        return this.modelInfo;
    }
    
    /**
     * Reload models (useful for development)
     */
    async reloadModels(configPath = null) {
        try {
            const response = await fetch(`${this.apiUrl}/api/models/reload`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    config_path: configPath
                })
            });
            
            const data = await response.json();
            if (data.status === 'success') {
                this.modelInfo = data.model_info;
                console.log('✅ Models reloaded successfully');
                return true;
            } else {
                console.error('❌ Failed to reload models:', data.error);
                return false;
            }
            
        } catch (error) {
            console.error('❌ Error reloading models:', error);
            return false;
        }
    }
    
    // Fallback heuristic AI for when API is not available
    fallbackMove(board, validMoves) {
        console.log('🎲 Using fallback heuristic AI');
        
        // Simple heuristic: prefer center, block obvious wins, create wins
        for (const move of validMoves) {
            // Check if we can win
            if (this.wouldWin(board, move, 2)) return move;
        }
        
        for (const move of validMoves) {
            // Check if we need to block
            if (this.wouldWin(board, move, 1)) return move;
        }
        
        // Prefer center columns
        const centerMoves = validMoves.filter(m => m >= 2 && m <= 4);
        if (centerMoves.length > 0) {
            return centerMoves[Math.floor(Math.random() * centerMoves.length)];
        }
        
        // Random valid move
        return validMoves[Math.floor(Math.random() * validMoves.length)];
    }
    
    fallbackHint(board, validMoves) {
        const move = this.fallbackMove(board, validMoves);
        return {
            move: move,
            explanation: `Heuristic suggests column ${move + 1} (API not available)`,
            confidence: 'low'
        };
    }
    
    wouldWin(board, col, player) {
        // Find drop row
        let row = -1;
        for (let r = 5; r >= 0; r--) {
            if (board[r][col] === 0) {
                row = r;
                break;
            }
        }
        if (row === -1) return false;
        
        // Temporarily place piece
        board[row][col] = player;
        
        // Check for win
        const directions = [[0,1], [1,0], [1,1], [1,-1]];
        for (const [dr, dc] of directions) {
            let count = 1;
            
            // Count positive direction
            for (let i = 1; i < 4; i++) {
                const newRow = row + dr * i;
                const newCol = col + dc * i;
                if (newRow < 0 || newRow >= 6 || newCol < 0 || newCol >= 7) break;
                if (board[newRow][newCol] === player) count++;
                else break;
            }
            
            // Count negative direction
            for (let i = 1; i < 4; i++) {
                const newRow = row - dr * i;
                const newCol = col - dc * i;
                if (newRow < 0 || newRow >= 6 || newCol < 0 || newCol >= 7) break;
                if (board[newRow][newCol] === player) count++;
                else break;
            }
            
            if (count >= 4) {
                board[row][col] = 0; // Remove temporary piece
                return true;
            }
        }
        
        board[row][col] = 0; // Remove temporary piece
        return false;
    }
}

// Export for use in game.js
window.Connect4RealAI = Connect4RealAI;