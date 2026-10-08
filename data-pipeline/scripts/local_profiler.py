#!/usr/bin/env python3
"""
OxenGL ERP — Local Data Quality Profiler
==========================================
Profiles exported CSVs to identify data quality issues before BigQuery load.
This is the local equivalent of Dataplex profiling when BQ access is restricted.

Outputs a profile JSON per table + aggregated quality report.
"""

import csv
import json
import os
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

UUID_RE = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.I)
EMAIL_RE = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
SAUDI_TIN_RE = re.compile(r'^3\d{13}3$')
DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}')


def profile_csv(filepath: Path) -> dict:
    """Profile a single CSV file and return quality metrics."""
    table_name = filepath.stem
    profile = {
        "table": table_name,
        "file": str(filepath),
        "row_count": 0,
        "columns": {},
        "quality_flags": [],
    }

    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            if not reader.fieldnames:
                profile["quality_flags"].append({"severity": "WARNING", "issue": "Empty file or no headers"})
                return profile

            # Init column stats
            col_stats = {}
            for col in reader.fieldnames:
                col_stats[col] = {
                    "null_count": 0,
                    "empty_count": 0,
                    "total": 0,
                    "distinct_values": set(),
                    "sample_values": [],
                    "type_hints": Counter(),
                    "max_length": 0,
                    "min_length": 999999,
                }

            rows = list(reader)
            profile["row_count"] = len(rows)

            if len(rows) == 0:
                profile["quality_flags"].append({"severity": "INFO", "issue": "Table is empty (header only)"})
                return profile

            for row in rows:
                for col in reader.fieldnames:
                    val = row.get(col, '')
                    stats = col_stats[col]
                    stats["total"] += 1

                    if val is None or val == '':
                        stats["null_count"] += 1
                        stats["empty_count"] += 1
                        continue

                    val_str = str(val).strip()

                    # Length tracking
                    stats["max_length"] = max(stats["max_length"], len(val_str))
                    stats["min_length"] = min(stats["min_length"], len(val_str))

                    # Distinct values (cap at 100 for memory)
                    if len(stats["distinct_values"]) < 100:
                        stats["distinct_values"].add(val_str)

                    # Sample values (cap at 5)
                    if len(stats["sample_values"]) < 5:
                        stats["sample_values"].append(val_str[:200])

                    # Type hinting
                    if UUID_RE.match(val_str):
                        stats["type_hints"]["uuid"] += 1
                    elif val_str.lower() in ('true', 'false', 't', 'f'):
                        stats["type_hints"]["boolean"] += 1
                    elif DATE_RE.match(val_str) and 'T' in val_str:
                        stats["type_hints"]["timestamp"] += 1
                    elif DATE_RE.match(val_str):
                        stats["type_hints"]["date"] += 1
                    else:
                        try:
                            float(val_str)
                            if '.' in val_str:
                                stats["type_hints"]["decimal"] += 1
                            else:
                                stats["type_hints"]["integer"] += 1
                        except ValueError:
                            stats["type_hints"]["string"] += 1

            # Build column profiles
            for col, stats in col_stats.items():
                total = stats["total"]
                null_rate = round(stats["null_count"] / total * 100, 1) if total > 0 else 0
                distinct_count = len(stats["distinct_values"])

                col_profile = {
                    "name": col,
                    "total_values": total,
                    "null_count": stats["null_count"],
                    "null_rate_pct": null_rate,
                    "distinct_count": distinct_count,
                    "distinct_rate_pct": round(distinct_count / max(total - stats["null_count"], 1) * 100, 1),
                    "max_length": stats["max_length"],
                    "min_length": stats["min_length"] if stats["min_length"] != 999999 else 0,
                    "inferred_type": stats["type_hints"].most_common(1)[0][0] if stats["type_hints"] else "unknown",
                    "type_distribution": dict(stats["type_hints"]),
                    "sample_values": stats["sample_values"],
                }

                # Flag quality issues
                if null_rate > 50:
                    profile["quality_flags"].append({
                        "severity": "WARNING",
                        "column": col,
                        "issue": f"High null rate: {null_rate}%",
                        "recommendation": "Investigate if column is truly optional or data is missing",
                    })

                if null_rate == 100:
                    profile["quality_flags"].append({
                        "severity": "CRITICAL",
                        "column": col,
                        "issue": "Column is 100% NULL",
                        "recommendation": "Consider dropping column or investigating data source",
                    })

                if distinct_count == 1 and total > 1 and null_rate < 100:
                    profile["quality_flags"].append({
                        "severity": "INFO",
                        "column": col,
                        "issue": f"Single distinct value: {stats['sample_values'][0][:50] if stats['sample_values'] else 'N/A'}",
                        "recommendation": "Column may be a constant — verify if meaningful",
                    })

                # UUID column with non-UUID values
                if 'id' in col.lower() and stats["type_hints"].get("uuid", 0) > 0:
                    non_uuid = total - stats["null_count"] - stats["type_hints"].get("uuid", 0)
                    if non_uuid > 0:
                        profile["quality_flags"].append({
                            "severity": "CRITICAL",
                            "column": col,
                            "issue": f"{non_uuid} non-UUID values in ID column",
                            "recommendation": "Clean with UUID regex validation",
                        })

                profile["columns"][col] = col_profile

        # Table-level quality score
        total_flags = len(profile["quality_flags"])
        critical = sum(1 for f in profile["quality_flags"] if f["severity"] == "CRITICAL")
        warning = sum(1 for f in profile["quality_flags"] if f["severity"] == "WARNING")
        score = max(0, 100 - (critical * 20) - (warning * 5))
        profile["quality_score"] = score
        profile["flag_summary"] = {"critical": critical, "warning": warning, "info": total_flags - critical - warning}

    except Exception as e:
        profile["quality_flags"].append({"severity": "CRITICAL", "issue": f"Profile failed: {str(e)}"})
        profile["quality_score"] = 0

    return profile


def main():
    export_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/root/oxen-gl/data-pipeline/profiles/pg_export")
    output_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("/root/oxen-gl/data-pipeline/profiles/quality_reports")
    output_dir.mkdir(parents=True, exist_ok=True)

    csv_files = sorted(export_dir.glob("*.csv"))
    # Filter out empty files (header-only)
    csv_files = [f for f in csv_files if f.stat().st_size > 50]

    print("=" * 70)
    print("  OxenGL ERP — Local Data Quality Profiler")
    print(f"  Source: {export_dir}")
    print(f"  Tables: {len(csv_files)}")
    print("=" * 70)

    all_profiles = []
    total_flags = {"CRITICAL": 0, "WARNING": 0, "INFO": 0}
    quality_scores = []

    for csv_file in csv_files:
        profile = profile_csv(csv_file)
        all_profiles.append(profile)

        if profile["row_count"] > 0:
            # Save individual profile
            profile_out = output_dir / f"{profile['table']}_profile.json"
            # Convert sets to lists for JSON serialization
            serializable = json.loads(json.dumps(profile, default=str))
            with open(profile_out, 'w') as f:
                json.dump(serializable, f, indent=2)

            quality_scores.append(profile.get("quality_score", 0))

            flag_summary = profile.get("flag_summary", {})
            total_flags["CRITICAL"] += flag_summary.get("critical", 0)
            total_flags["WARNING"] += flag_summary.get("warning", 0)
            total_flags["INFO"] += flag_summary.get("info", 0)

            status = "🟢" if profile.get("quality_score", 0) >= 90 else "🟡" if profile.get("quality_score", 0) >= 70 else "🔴"
            print(f"  {status} {profile['table']:40s} | {profile['row_count']:6d} rows | Score: {profile.get('quality_score', 0):3d} | Flags: {flag_summary.get('critical', 0)}C {flag_summary.get('warning', 0)}W {flag_summary.get('info', 0)}I")

    # Aggregate summary
    tables_with_data = [p for p in all_profiles if p["row_count"] > 0]
    avg_score = sum(quality_scores) / len(quality_scores) if quality_scores else 0

    summary = {
        "profiled_at": datetime.utcnow().isoformat(),
        "total_tables": len(csv_files),
        "tables_with_data": len(tables_with_data),
        "empty_tables": len(csv_files) - len(tables_with_data),
        "total_rows": sum(p["row_count"] for p in all_profiles),
        "avg_quality_score": round(avg_score, 1),
        "total_flags": total_flags,
        "tables_needing_attention": [
            {"table": p["table"], "score": p.get("quality_score", 0), "flags": p.get("flag_summary", {})}
            for p in tables_with_data
            if p.get("quality_score", 0) < 90
        ],
    }

    summary_path = output_dir / "aggregate_quality_report.json"
    with open(summary_path, 'w') as f:
        json.dump(summary, f, indent=2)

    print("\n" + "=" * 70)
    print(f"  Quality Summary")
    print(f"  Tables Profiled: {len(tables_with_data)} (with data) / {len(csv_files)} total")
    print(f"  Total Rows: {summary['total_rows']}")
    print(f"  Avg Quality Score: {avg_score:.0f}/100")
    print(f"  Flags: {total_flags['CRITICAL']} Critical, {total_flags['WARNING']} Warning, {total_flags['INFO']} Info")
    if summary["tables_needing_attention"]:
        print(f"\n  ⚠ Tables Needing Attention ({len(summary['tables_needing_attention'])}):")
        for t in summary["tables_needing_attention"]:
            print(f"    - {t['table']} (Score: {t['score']})")
    print("=" * 70)
    print(f"  📋 Full report: {summary_path}")


if __name__ == "__main__":
    main()
