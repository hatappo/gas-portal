import { mount } from 'svelte';
import '../../../src/shared/i18n.js';
import '../../style.css';
import App from '../../App.svelte';
mount(App, { target: document.getElementById('app')! });
