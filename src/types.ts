import { Stockfish } from "./engine"

export declare class grecaptcha {
    static reset(): void;
    static getResponse(): string;
}

export interface Profile {
    username: string,
    rating: string,
    aiLevel?: string
}

export interface Game {
    white: Profile,
    black: Profile,
    timeClass: string,
    pgn: string
}

export interface Coordinate {
    x: number,
    y: number
}

export interface Move {
    san: string,
    uci: string
}

export interface Evaluation {
    type: string,
    value: number
}

export interface EngineLine {
    id: number,
    depth: number,
    evaluation: Evaluation,
    moveUCI: string,
    moveSAN?: string
}

export interface Position {
    fen: string,
    move?: Move,
    topLines?: EngineLine[],
    cutoffEvaluation?: Evaluation,
    worker?: Stockfish | string
    classification?: string,
    opening?: string,
    positions?: any
}

export type Classifications = 
    "brilliant" |
    "great"|
    "best"|
    "excellent"|
    "good"|
    "inaccuracy"|
    "mistake"|
    "blunder"|
    "book"|
    "forced";

export interface ClassificationCount extends Record<Classifications, number> {}


export interface Report {
    accuracies: {
        white: number,
        black: number
    },
    classifications: {
        white: ClassificationCount,
        black: ClassificationCount
    },
    positions: Position[]
}

export interface SavedAnalysis {
    results: Report,
    players: {
        white: Profile,
        black: Profile
    }
}

export interface ParseResponse {
    message?: string,
    positions?: Position[]
}

export interface ReportResponse {
    message?: string,
    results?: Report 
}
