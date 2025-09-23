/**
 * Simple direct fix for Connect 4 HF connection
 * This completely bypasses the complex initialization and connects directly
 */

console.log('🚀 SIMPLE FIX: Loading direct HF connection...');

class SimpleHFAI {
    constructor() {
        this.spaceUrl = "https://drbayes-connect4-tournament-ai.hf.space";
        this.isAvailable = false;
        this.checkConnection();
    }
    
    async checkConnection() {
        try {
            console.log('🔄 SIMPLE: Testing connection...');
            const response = await fetch(`${this.spaceUrl}/health`);
            
            if (response.ok) {
                const data = await response.json();
                console.log('📥 SIMPLE: Health response:', data);
                
                this.isAvailable = data.ai_loaded === true;
                
                const statusEl = document.getElementById('connection-status');
                if (statusEl) {
                    if (this.isAvailable) {
                        statusEl.innerHTML = '✅ Tournament AI Connected! (Simple Fix)';
                        statusEl.style.color = 'green';
                    } else {
                        statusEl.innerHTML = '❌ AI not loaded on server';
                        statusEl.style.color = 'red';
                    }
                }
                
                console.log('✅ SIMPLE: Connection result:', this.isAvailable ? 'SUCCESS' : 'FAILED');
            }
        } catch (error) {
            console.error('❌ SIMPLE: Connection failed:', error);
            this.isAvailable = false;
        }
    }
    
    async chooseMove(board, validMoves) {
        if (!this.isAvailable) {
            console.error('❌ SIMPLE: AI not available');
            throw new Error('AI not connected');
        }
        
        try {
            console.log('🎯 SIMPLE: Making move request...');
            const response = await fetch(`${this.spaceUrl}/api/move`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({ board: board })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            console.log('🏆 SIMPLE: AI response:', data);
            
            return data.move;
        } catch (error) {
            console.error('❌ SIMPLE: Move failed:', error);
            throw error;
        }
    }
}

// Override the game AI initialization
document.addEventListener('DOMContentLoaded', () => {
    console.log('🔧 SIMPLE: Initializing simple HF AI...');
    
    setTimeout(() => {
        window.simpleAI = new SimpleHFAI();
        
        // Override the game's AI after it loads
        setTimeout(() => {
            if (window.game) {
                console.log('🎮 SIMPLE: Overriding game AI...');
                window.game.realAI = window.simpleAI;
                window.game.realAI.name = "Tournament AI (Simple Connection)";
                console.log('✅ SIMPLE: Game AI updated');
            }
        }, 2000);
    }, 500);
});