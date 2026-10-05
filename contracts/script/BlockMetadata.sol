// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Catalog metadata for the native blocks, as inline data: URIs. Third-party blocks
/// use the same JSON shape, which is what lets the web app's Builder render a settings form
/// for any approved block without code changes:
///
/// {
///   "name": string, "summary": string,
///   "lanes": "launch" | "any",
///   "config": [ { "key", "type": "uint16"|"uint24"|"uint32", "label",
///                 "unit": "pips"|"bps"|"seconds"|"number", "min", "max", "default" } ]
/// }
///
/// Config fields are ABI-encoded in the order listed. Units: pips = millionths (10000 = 1%),
/// bps = ten-thousandths (100 = 1%).
library BlockMetadata {
    string internal constant PREFIX = "data:application/json;utf8,";

    function guard() internal pure returns (string memory) {
        return string.concat(
            PREFIX,
            '{"name":"Launch guard","summary":"For the first minutes: a buy fee that falls to the base fee, a cap on each buy, and no outside liquidity.","lanes":"launch","config":[',
            '{"key":"premium","type":"uint24","label":"Extra buy fee at the open","unit":"pips","min":0,"max":490000,"default":290000},',
            '{"key":"duration","type":"uint32","label":"Guard length","unit":"seconds","min":1,"max":900,"default":180},',
            '{"key":"maxBuyBps","type":"uint16","label":"Max buy per trade, share of supply","unit":"bps","min":0,"max":1000,"default":100}]}'
        );
    }

    function damper() internal pure returns (string memory) {
        return string.concat(
            PREFIX,
            '{"name":"Dump damper","summary":"The sell fee rises with net selling and fades over about an hour. A fast mass exit pays up to the cap.","lanes":"any","config":[',
            '{"key":"slope","type":"uint32","label":"Strength","unit":"number","min":1,"max":1000000,"default":500000},',
            '{"key":"maxSurcharge","type":"uint24","label":"Max extra sell fee","unit":"pips","min":1,"max":99000,"default":70000}]}'
        );
    }

    function burn() internal pure returns (string memory) {
        return string.concat(
            PREFIX,
            '{"name":"Auto-burn","summary":"Burns a share of every buy, forever.","lanes":"any","config":[',
            '{"key":"burnBps","type":"uint16","label":"Burned share of each buy","unit":"bps","min":1,"max":500,"default":100}]}'
        );
    }

    function surge() internal pure returns (string memory) {
        return string.concat(
            PREFIX,
            '{"name":"Surge fee","summary":"The fee grows with each trade\'s size against pool depth, both ways. Whales pay more; LPs who absorb the move earn it.","lanes":"any","config":[',
            '{"key":"slope","type":"uint32","label":"Strength","unit":"number","min":1,"max":1000000,"default":300000},',
            '{"key":"maxSurcharge","type":"uint24","label":"Max extra fee","unit":"pips","min":1,"max":99000,"default":20000}]}'
        );
    }
}
