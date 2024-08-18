import { Router } from "express";
import fetch from "node-fetch";
import { Chess } from "chess.js";
import pgnParser from "pgn-parser";

import analyse from "./lib/analysis";
import { ParseRequestBody, ReportRequestBody } from "./lib/types/RequestBody";

import { Stockfish } from "./engine"
import { EngineLine, Position } from "./types";

const router = Router();

const parse = async (pgn: any, fen: string | undefined, res: any) => {
    
    
    if (!pgn) {
        return res.status(400).json({ message: "Enter a PGN to analyse." });
    }

    // Parse PGN into object
    try {
        var [ parsedPGN ] = pgnParser.parse(pgn);

        if (!parsedPGN) {
            return res.status(400).json({ message: "Enter a PGN to analyse." });
        }
    } catch (err) {
        return res.status(500).json({ message: "Failed to parse invalid PGN." });
    }

    // Create a virtual board
    let board = typeof fen == "string" ? new Chess(fen) : new Chess();
    let positions: Position[] = [];

    positions.push({ fen: board.fen() });

    // Add each move to the board; log FEN and SAN
    for (let pgnMove of parsedPGN.moves) {
        let moveSAN = pgnMove.move;

        let virtualBoardMove;
        try {
            virtualBoardMove = board.move(moveSAN);
        } catch (err) {
            return res.status(400).json({ message: "PGN contains illegal moves." });
        }

        let moveUCI = virtualBoardMove.from + virtualBoardMove.to;

        positions.push({
            fen: board.fen(),
            move: {
                san: moveSAN,
                uci: moveUCI
            }
        });
    }

    return positions
}
router.post("/parse", async (req, res) => {
    let { pgn, fen }: ParseRequestBody = req.body;
    const positions = await parse(pgn, fen, res);
    res.json({ positions });
});

router.post("/report", async (req, res) => {

    let { positions }: ReportRequestBody = req.body;

    if (!positions) {
        return res.status(400).json({ message: "Missing parameters." });
    }


    // Generate report
    try {
        var results = await analyse(positions);
    } catch (err) {
        console.log(err);
        return res.status(500).json({ message: "Failed to generate report." });
    }

    res.json({ results });

});



async function evaluate(res: any, pgn: string, fen: string, depth: number = 16) {
    let ongoingEvaluation = false;

    let evaluatedPositions: Position[] = [];

    console.log("Step 1")

    var positions = await parse(pgn, fen, res);

    console.log("Step 2")
    
    // Fetch cloud evaluations where possible
    for (let position of positions) {
        function placeCutoff() {
            let lastPosition = positions[positions.indexOf(position) - 1];
            if (!lastPosition) return;

            let cutoffWorker = new Stockfish();
            cutoffWorker
                .evaluate(lastPosition.fen, depth)
                .then((engineLines) => {
                    lastPosition.cutoffEvaluation = engineLines.find(
                        (line) => line.id == 1,
                    )?.evaluation ?? { type: "cp", value: 0 };
                });
        }

        let queryFen = position.fen.replace(/\s/g, "%20");
        let cloudEvaluationResponse;
        try {
            cloudEvaluationResponse = await fetch(
                `https://lichess.org/api/cloud-eval?fen=${queryFen}&multiPv=2`,
                {
                    method: "GET",
                },
            );

            if (!cloudEvaluationResponse) break;
        } catch {
            break;
        }

        if (!cloudEvaluationResponse.ok) {
            placeCutoff();
            break;
        }

        let cloudEvaluation = await cloudEvaluationResponse.json();

        position.topLines = cloudEvaluation.pvs.map((pv: any, id: number) => {
            const evaluationType = pv.cp == undefined ? "mate" : "cp";
            const evaluationScore = pv.cp ?? pv.mate ?? "cp";

            let line: EngineLine = {
                id: id + 1,
                depth: depth,
                moveUCI: pv.moves.split(" ")[0] ?? "",
                evaluation: {
                    type: evaluationType,
                    value: evaluationScore,
                },
            };

            let cloudUCIFixes: { [key: string]: string } = {
                e8h8: "e8g8",
                e1h1: "e1g1",
                e8a8: "e8c8",
                e1a1: "e1c1",
            };
            line.moveUCI = cloudUCIFixes[line.moveUCI] ?? line.moveUCI;

            return line;
        });

        if (position.topLines?.length != 2) {
            placeCutoff();
            break;
        }

        position.worker = "cloud";
        let progress =
        ((positions.indexOf(position) + 1) / positions.length) * 100;
    
        console.log(`Evaluating positions... (${progress.toFixed(1)}%)`)
    }

    
    console.log("Step 3")
    
    // Evaluate remaining positions
    let workerCount = 0;

    let last_progress = 0; 
    ongoingEvaluation = true;
    const stockfishManager = setInterval(() => {
        // If all evaluations have been generated, move on
        
        if (!positions.some((pos: Position) => !pos.topLines)) {
            clearInterval(stockfishManager);

            evaluatedPositions = positions;
            ongoingEvaluation = false;

            return;
        }

        // Find next position with no worker and add new one
        for (let position of positions) {
            if (position.worker || workerCount >= 8) continue;

            let worker = new Stockfish();
            worker.evaluate(position.fen, depth).then((engineLines) => {
                position.topLines = engineLines;
                console.log("Line Found!")
                workerCount--;
            });

            position.worker = worker;
            workerCount++;
        }

        // Update progress monitor
        let workerDepths = 0;
        for (let position of positions) {
            if (typeof position.worker == "object") {
                workerDepths += position.worker.depth;
            } else if (typeof position.worker == "string") {
                workerDepths += depth;
            }
        }
        let progress = (workerDepths / (positions.length * depth)) * 100;
        
        console.log(`Evaluating positions... (${progress.toFixed(1)}%)`)
        last_progress = progress;
    }, 100);

    console.log("Step 4")
    
    while (ongoingEvaluation) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    console.log("Step 5")
    
    const results = await analyse(positions)

    console.log("Step 6", results)
    return results;
}

router.post("/analyse", async (req, res) => {
    let { pgn, fen, depth } = req.body;

    // Content validate PGN input
    if (!pgn) {
        return {error: "Provide a game to analyse."};
    }

    if (!depth) {
        depth = 16;
    }
    try {
        return res.json(await evaluate(res, pgn, fen, depth));

    } catch (e) {
        console.log(e)
    }
})


export default router;