import { EvaluatedPosition } from "./Position";

export interface ParseRequestBody {
    pgn?: string;
    fen?: string;
}

export interface ReportRequestBody {
    positions?: EvaluatedPosition[],
    captchaToken?: string
}