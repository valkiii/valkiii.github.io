/**
 * Direct fix for Connect 4 HF Space connection
 * This bypasses all caching issues with a working solution
 */

class Connect4DirectAI {
    constructor() {
        this.name = "Tournament AI (Direct Connection)";
        this.spaceUrl = "https://drbayes-connect4-tournament-ai.hf.space";
        this.apiEndpoint = `${this.spaceUrl}/api/move`;
        this.healthEndpoint = `${this.spaceUrl}/health`;
        this.isAvailable = false;
        
        console.log('🚀 Direct AI connection initializing...');
        this.checkConnection();
    }
    
    async checkConnection() {
        try {
            console.log('🔄 Testing direct connection to HF Space...');
            
            const response = await fetch(this.healthEndpoint, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                },
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log('📥 Health response:', data);
                
                if (data.ai_loaded === true) {
                    this.isAvailable = true;
                    console.log('✅ Direct connection SUCCESS! Tournament AI is ready');
                    console.log('🏆 AI Type:', data.ai_type);
                    console.log('🧠 Models:', data.model_info?.total_models || 'Unknown');
                    
                    // Update status on page
                    const statusEl = document.getElementById('connection-status');
                    if (statusEl) {
                        statusEl.innerHTML = '✅ Connected to tournament AI! Ready to play.';
                        statusEl.style.color = 'green';
                    }
                } else {
                    console.error('❌ AI not loaded on HF Space:', data.error);
                    const statusEl = document.getElementById('connection-status');
                    if (statusEl) {
                        statusEl.innerHTML = '❌ Tournament AI not loaded. Check console for details.';
                        statusEl.style.color = 'red';
                    }
                }
            } else {
                console.error('❌ Health check failed:', response.status, response.statusText);
            }
        } catch (error) {
            console.error('❌ Connection error:', error);
            this.isAvailable = false;
            
            const statusEl = document.getElementById('connection-status');
            if (statusEl) {
                statusEl.innerHTML = '❌ Cannot connect to tournament AI. Check internet connection.';
                statusEl.style.color = 'red';
            }
        }
    }
    
    async chooseMove(board, validMoves) {
        if (!this.isAvailable) {
            console.error('❌ Direct AI not available');
            throw new Error('Tournament AI not connected');
        }
        
        try {
            console.log('🎯 Making move request to tournament AI...');
            console.log('Board:', board);
            console.log('Valid moves:', validMoves);
            
            const response = await fetch(this.apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({ board: board })
            });
            
            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('🏆 Tournament AI response:', data);
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            const move = parseInt(data.move);
            console.log(`✅ Tournament AI chose column: ${move}`);
            return move;
            
        } catch (error) {
            console.error('❌ Move request failed:', error);
            throw error;
        }
    }
}

// Global function to initialize direct AI
window.initDirectAI = function() {
    console.log('🔧 Initializing direct AI connection...');
    window.directAI = new Connect4DirectAI();
    
    // Wait for connection check
    setTimeout(() => {
        if (window.directAI.isAvailable) {
            console.log('✅ Direct AI ready! You can play against the tournament AI.');
            
            // Update game AI if possible
            if (window.game) {
                window.game.realAI = window.directAI;
                console.log('🎮 Game AI updated to direct connection');
            }
        } else {
            console.error('❌ Direct AI connection failed');
        }
    }, 2000);
};

// Auto-initialize
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(window.initDirectAI, 1000);
});