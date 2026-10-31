// Separate deployment identity. Never deploy this entry point to the test Worker.
import {createWorker} from './worker.mjs';
export default createWorker(fetch,'production');
