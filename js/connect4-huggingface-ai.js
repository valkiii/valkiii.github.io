/**
 * Connect 4 Hugging Face AI - Integration with HF Spaces API
 * Connects to your actual tournament-winning ensemble deployed on Hugging Face
 */

class Connect4HuggingFaceAI {
    constructor(spaceUrl = null) {
        this.name = "Tournament AI Ensemble (HF)";
        this.isAvailable = false;
        this.spaceUrl = spaceUrl || "https://YOUR_USERNAME-connect4-tournament-ai.hf.space";
        this.apiEndpoint = `${this.spaceUrl}/api/move`;
        this.healthEndpoint = `${this.spaceUrl}/health`;
        
        console.log('🤗 Hugging Face AI initialized');
        console.log(`🔗 API endpoint: ${this.apiEndpoint}`);
        
        // Check if the HF Space is available
        this.checkAvailability();
    }
    
    async checkAvailability() {
        try {
            console.log('🔄 Checking Hugging Face Space availability...');
            
            const response = await fetch(this.healthEndpoint, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                },
                timeout: 10000 // 10 second timeout
            });
            
            if (response.ok) {
                const healthData = await response.json();
                this.isAvailable = healthData.ensemble_loaded || false;
                
                if (this.isAvailable) {
                    console.log('✅ Hugging Face Space is healthy and ensemble is loaded');
                    console.log('🏆 Model info:', healthData.model_info);
                } else {
                    console.warn('⚠️ Hugging Face Space is up but ensemble not loaded');
                }
            } else {
                console.error('❌ Hugging Face Space health check failed:', response.status);
                this.isAvailable = false;
            }
        } catch (error) {
            console.error('❌ Error checking Hugging Face Space availability:', error);
            this.isAvailable = false;
        }
    }
    
    async chooseMove(board, validMoves) {
        if (!this.isAvailable) {
            console.error('❌ Hugging Face AI not available');
            return null;
        }
        
        try {
            console.log('🤗 Sending move request to Hugging Face Space...');
            console.log('📋 Board state:', board);
            console.log('✅ Valid moves:', validMoves);
            
            const requestData = {
                board: board
            };
            
            const response = await fetch(this.apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify(requestData),
                timeout: 15000 // 15 second timeout for AI thinking
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('📥 HF API response:', data);
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            const aiMove = data.move;
            console.log(`🧠 HF AI chose move: ${aiMove + 1} (column ${aiMove + 1})`);
            console.log(`🎯 Ensemble method: ${data.ensemble_method}`);
            console.log(`🏆 Using ${data.model_count} models`);
            
            return aiMove;
            
        } catch (error) {
            console.error('❌ Error getting move from Hugging Face AI:', error);
            
            // Check if it's a network error and try to reconnect
            if (error.name === 'TypeError' || error.message.includes('fetch')) {
                console.log('🔄 Network error detected, rechecking availability...');
                await this.checkAvailability();
            }
            
            throw error;
        }
    }
    
    async getHint(board, validMoves) {
        try {
            const move = await this.chooseMove(board, validMoves);
            if (move !== null) {
                return {
                    move: move,
                    explanation: `🏆 Tournament AI suggests column ${move + 1} - This is what the actual ensemble would play!`,
                    confidence: 'high'
                };
            } else {
                return {
                    move: null,
                    explanation: "Unable to get hint from Hugging Face AI",
                    confidence: 'low'
                };
            }
        } catch (error) {
            console.error('❌ Error getting hint from Hugging Face AI:', error);
            return {
                move: null,
                explanation: "Error getting hint from AI ensemble",
                confidence: 'low'
            };
        }
    }
    
    // Utility method to update the Space URL if needed
    updateSpaceUrl(newUrl) {
        this.spaceUrl = newUrl;
        this.apiEndpoint = `${this.spaceUrl}/api/move`;
        this.healthEndpoint = `${this.spaceUrl}/health`;
        console.log(`🔄 Updated HF Space URL to: ${this.spaceUrl}`);
        
        // Recheck availability with new URL
        this.checkAvailability();
    }
    
    // Get status for UI display
    getStatus() {
        if (this.isAvailable) {
            return {
                status: 'active',
                message: '🏆 Tournament AI Ensemble Active',
                detail: 'Connected to actual neural networks on Hugging Face'
            };
        } else {
            return {
                status: 'unavailable',
                message: '🤗 Connecting to Hugging Face...',
                detail: 'Checking tournament AI availability'
            };
        }
    }
}

// Export for use in game.js
window.Connect4HuggingFaceAI = Connect4HuggingFaceAI;

// Also maintain backward compatibility
window.Connect4RealAI = Connect4HuggingFaceAI;