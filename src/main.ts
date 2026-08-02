import "./styles/tokens.css";
import { incompleteModels, models } from "./data/models";

// Keep the scaffold's typed dataset in the entry graph. The chart layer consumes it in T2+.
document.documentElement.dataset.modelCount = String(models.length);
document.documentElement.dataset.incompleteModelCount = String(incompleteModels().length);
