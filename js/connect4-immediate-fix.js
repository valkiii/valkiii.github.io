/**
 * Immediate fix - override everything and force connection
 */

console.log('⚡ IMMEDIATE FIX: Force connecting to HF Space...');

// Direct working AI class
class WorkingHFAI {
    constructor() {
        this.name = "Tournament AI (Force Connected)";
        this.spaceUrl = "https://drbayes-connect4-tournament-ai.hf.space";
        this.isAvailable = true; // Force available
        console.log('⚡ IMMEDIATE: AI forced to available state');
    }
    
    async chooseMove(board, validMoves) {
        try {
            console.log('⚡ IMMEDIATE: Making move request (forced)...');
            
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
            console.log('⚡ IMMEDIATE: Success! AI response:', data);
            
            // Update status to show it's working
            const statusEl = document.getElementById('connection-status');
            if (statusEl) {
                statusEl.innerHTML = '⚡ Tournament AI Working! (Force Connected)';
                statusEl.style.color = 'green';
            }
            
            return data.move;
        } catch (error) {
            console.error('⚡ IMMEDIATE: Move failed:', error);
            throw error;
        }
    }
}

// Immediately replace any AI when DOM loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('⚡ IMMEDIATE: DOM loaded, forcing AI connection...');
    
    // Create working AI
    window.workingAI = new WorkingHFAI();
    
    // Update status immediately
    const statusEl = document.getElementById('connection-status');
    if (statusEl) {
        statusEl.innerHTML = '⚡ Force connecting to tournament AI...';
        statusEl.style.color = 'orange';
    }
    
    // Override game AI as soon as possible
    const checkAndOverride = () => {
        if (window.game) {
            console.log('⚡ IMMEDIATE: Found game, overriding AI...');
            window.game.realAI = window.workingAI;
            window.game.gameActive = true;
            console.log('⚡ IMMEDIATE: AI overridden successfully!');
            
            // Update game's AI status
            window.game.updateAIStatus('Force Connected');
            return true;
        }
        return false;
    };
    
    // Try to override immediately and keep trying
    if (!checkAndOverride()) {
        const interval = setInterval(() => {
            if (checkAndOverride()) {
                clearInterval(interval);
            }
        }, 100);
        
        // Stop trying after 10 seconds
        setTimeout(() => clearInterval(interval), 10000);
    }
});

console.log('⚡ IMMEDIATE FIX: Script loaded and ready');