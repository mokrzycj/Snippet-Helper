// src/options/tutorial.js

import { STORAGE_KEYS } from '../shared/constants.js';

export class TutorialManager {
    constructor() {
        this.currentStep = 0;
        this.steps = [
            {
                title: "Welcome to Text Expander Pro! 🚀",
                content: "Automate your repetitive typing. This tool helps you expand short triggers into full templates instantly.",
                icon: "👋"
            },
            {
                title: "Creating Shortcuts",
                content: "Use the sidebar to add a new trigger. We recommend using a unique suffix like <b>//</b> (e.g., <i>hi//</i>) to avoid accidental expansions.",
                icon: "✏️"
            },
            {
                title: "Magic Variables 🪄",
                content: "Use dynamic content like <b>{{date}}</b>, <b>{{time}}</b>, or <b>{{prompt:Label}}</b>. In ServiceNow, you can even use <b>{{caller_name}}</b>!",
                icon: "✨"
            },
            {
                title: "The Cursor Trick",
                content: "Place a <b>|</b> (pipe) character in your template. After expansion, the cursor will jump exactly to that spot!",
                icon: "📍"
            },
            {
                title: "Ghost Text & Tab",
                content: "As you type, a gray preview appears. Press <b>Tab ⇥</b> to instantly complete the suggestion.",
                icon: "👻"
            },
            {
                title: "Quick Search Dashboard",
                content: "Type <b>;;</b> anywhere (or click the extension icon) to search your library and copy templates manually.",
                icon: "🔍"
            }
        ];
    }

    async init() {
        chrome.storage.local.get([STORAGE_KEYS.HAS_SEEN_TUTORIAL], (res) => {
            if (!res[STORAGE_KEYS.HAS_SEEN_TUTORIAL]) {
                this.show();
            }
        });
    }

    show() {
        let modal = document.getElementById('tutorial-modal');
        if (!modal) {
            this.createModal();
            modal = document.getElementById('tutorial-modal');
        }
        modal.style.display = 'flex';
        this.renderStep();
    }

    createModal() {
        const overlay = document.createElement('div');
        overlay.id = 'tutorial-modal';
        overlay.className = 'modal-overlay';
        overlay.style.zIndex = '20000';
        
        overlay.innerHTML = `
            <div class="modal" style="max-width: 500px;">
                <div id="tutorial-icon" style="font-size: 50px; margin-bottom: 20px;"></div>
                <div id="tutorial-title" class="modal-title"></div>
                <div id="tutorial-body" class="modal-body" style="font-size: 16px; min-height: 80px;"></div>
                
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 20px;">
                    <div id="tutorial-progress" style="font-size: 12px; color: var(--text-muted);"></div>
                    <div class="modal-footer" style="margin: 0; gap: 10px;">
                        <button id="tutorial-prev" class="modal-btn cancel" style="min-width: 80px; display: none;">Back</button>
                        <button id="tutorial-next" class="modal-btn confirm" style="min-width: 80px;">Next</button>
                        <button id="tutorial-skip" class="text-link" style="margin-left: 10px;">Skip Guide</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('tutorial-next').onclick = () => this.next();
        document.getElementById('tutorial-prev').onclick = () => this.prev();
        document.getElementById('tutorial-skip').onclick = () => this.close();
    }

    renderStep() {
        const step = this.steps[this.currentStep];
        document.getElementById('tutorial-icon').innerText = step.icon;
        document.getElementById('tutorial-title').innerText = step.title;
        document.getElementById('tutorial-body').innerHTML = step.content;
        document.getElementById('tutorial-progress').innerText = `Step ${this.currentStep + 1} of ${this.steps.length}`;
        
        document.getElementById('tutorial-prev').style.display = this.currentStep === 0 ? 'none' : 'block';
        document.getElementById('tutorial-next').innerText = this.currentStep === this.steps.length - 1 ? "Finish" : "Next";
    }

    next() {
        if (this.currentStep < this.steps.length - 1) {
            this.currentStep++;
            this.renderStep();
        } else {
            this.close();
        }
    }

    prev() {
        if (this.currentStep > 0) {
            this.currentStep--;
            this.renderStep();
        }
    }

    close() {
        const modal = document.getElementById('tutorial-modal');
        if (modal) modal.style.display = 'none';
        chrome.storage.local.set({ [STORAGE_KEYS.HAS_SEEN_TUTORIAL]: true });
    }
}
