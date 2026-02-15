import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Obsidian Pre-Prompt Hook
 * Injects the latest Obsidian daily log into the agent's bootstrap context on every turn.
 * Applied globally to ensure 100% memory continuity for current-day events.
 */
export default async function handler(event, context) {
  if (event.type === 'agent:bootstrap') {
    try {
      // 1. Attempt to read via Obsidian CLI (preferred for real-time sync)
      let obsidianOutput = '';
      try {
        obsidianOutput = execSync('DISPLAY=:99 /usr/local/bin/obsidian-cli daily:read', { 
          encoding: 'utf8',
          timeout: 3000 // Slightly increased timeout
        });
      } catch (cliError) {
        // console.error('⚠️ Obsidian CLI failure, attempting direct file read...');
        
        // 2. Fallback: Direct file read if CLI fails (e.g. headless service down)
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const dailyPath = path.join(process.cwd(), 'Daily', `${year}-${month}-${day}.md`);
        
        if (fs.existsSync(dailyPath)) {
          obsidianOutput = fs.readFileSync(dailyPath, 'utf8');
        } else {
          throw new Error(`Daily log not found at ${dailyPath}`);
        }
      }
      
      if (obsidianOutput && obsidianOutput.trim()) {
        context.bootstrapFiles = context.bootstrapFiles || {};
        
        // Inject as a virtual file that will appear in Project Context
        context.bootstrapFiles['OBSIDIAN_DAILY.md'] = `# Obsidian Daily Log Essence\n\n${obsidianOutput.trim()}\n\n---\n*Injected via Obsidian Pre-Prompt Hook*`;
      } else {
        // If empty, provide a hint to the agent
        context.bootstrapFiles = context.bootstrapFiles || {};
        context.bootstrapFiles['OBSIDIAN_DAILY.md'] = `# Obsidian Daily Log\n\nNo log entries found for today yet. Use the obsidian-life-memory skill to log events.`;
      }
    } catch (error) {
      // Provide an error hint in the context so the agent knows memory is failing
      context.bootstrapFiles = context.bootstrapFiles || {};
      context.bootstrapFiles['OBSIDIAN_ERROR.md'] = `# Obsidian Memory Error\n\nThe pre-prompt hook failed to load today's log: ${error.message}\n\nPlease check the Obsidian service status.`;
      console.error('❌ Obsidian preprompt hook failure:', error.message);
    }
  }
}
