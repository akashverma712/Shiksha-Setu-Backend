import io
import pandas as pd
import joblib
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Any, Dict
import uvicorn
import os
from bson import ObjectId

from pymongo import MongoClient
from dotenv import load_dotenv

from model_utils2 import compute_rule_columns

load_dotenv()   

MONGO_URI = os.getenv("MONGO_URI")  
DB_NAME = os.getenv("DB_NAME", "sih_dropout_db")
COLLECTION_NAME = os.getenv("COLLECTION_NAME", "predictions")


app = FastAPI(title="Dropout Prediction System - SIH")


ml_model = joblib.load("dropout_model_xgb.pkl")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

client = MongoClient(MONGO_URI)
db = client[DB_NAME]
collection = db[COLLECTION_NAME]
student_collection = db["students"] # Assuming collection name is 'students' based on 'Student' model

# --- Data Models for JSON Input ---

class AttendanceItem(BaseModel):
    student: str # ObjectId as string
    date: Optional[str] = None
    status: str
    # Add other fields if necessary, but we mainly need student and status/presence

class MarksItem(BaseModel):
    rollNo: str
    semester: str
    cgpa: float
    # date: Optional[str]

class FeesItem(BaseModel):
    rollNo: str
    amount: float
    status: str
    scholarshipName: Optional[str] = None
    payment_status: Optional[str] = None # Alias for status if needed?
    outstanding_months: Optional[int] = None # If passed directly?

class PredictionPayload(BaseModel):
    attendance: List[Dict[str, Any]] # Using Dict to be flexible with extra fields
    marks: List[Dict[str, Any]]
    fees: List[Dict[str, Any]]


def compute_fee_weight(months_unpaid):
    if months_unpaid >= 3:
        return 1.0
    elif months_unpaid == 2:
        return 0.7
    elif months_unpaid == 1:
        return 0.4
    return 0.0


def get_zone(final_score):
    if final_score >= 65:
        return "Red Zone"
    elif final_score >= 25:
        return "Yellow Zone"
    return "Green Zone"

# --- Helper to map ObjectId to RollNo ---
def get_student_map():
    """
    Returns a dictionary: { str(ObjectId) : rollNo_string }
    """
    students = student_collection.find({}, {"_id": 1, "rollNo": 1})
    mapping = {}
    for s in students:
        if "rollNo" in s:
            mapping[str(s["_id"])] = s["rollNo"]
    return mapping


@app.post("/predict")
async def predict_json(payload: PredictionPayload):
    try:
        # 1. Fetch Student Mapping (ObjectId -> RollNo)
        student_map = get_student_map()
        
        # 2. Process Attendance
        # We need to calculate attendance percentage per student (rollNo)
        # Input: List of daily/subject attendance records
        # Output: DataFrame with student_id, attendance (percentage)
        
        att_data = []
        if payload.attendance:
             # Group by student ID first
            att_counts = {} # { student_id: { total: 0, present: 0 } }
            
            for item in payload.attendance:
                # 'student' in item is ObjectId
                s_oid = item.get("student")
                if not s_oid: continue
                
                # Map to RollNo
                roll_no = student_map.get(s_oid)
                if not roll_no: continue # specific log?

                if roll_no not in att_counts:
                    att_counts[roll_no] = {"total": 0, "present": 0}
                
                status = item.get("status", "").lower()
                att_counts[roll_no]["total"] += 1
                if status == "present":
                    att_counts[roll_no]["present"] += 1

            # Convert to list for DataFrame
            for roll_no, counts in att_counts.items():
                pct = (counts["present"] / counts["total"] * 100) if counts["total"] > 0 else 0
                att_data.append({"student_id": roll_no, "attendance": pct})
        
        df_att = pd.DataFrame(att_data)
        if df_att.empty:
            # Fallback if no attendance data, create empty with column
            df_att = pd.DataFrame(columns=["student_id", "attendance"])


        # 3. Process Marks
        # Input: List of marks records
        # Output: DataFrame with student_id, cgpa_semX or just avg_cgpa
        marks_data = []
        if payload.marks:
            for item in payload.marks:
                roll_no = item.get("rollNo")
                if not roll_no: continue
                
                # We need to reshape this potentially? 
                # The existing logic expects wide format or computes avg.
                # Let's just create a row per record and let pandas pivot or group
                marks_data.append({
                    "student_id": roll_no,
                    "semester": item.get("semester"), # e.g. "1"
                    "cgpa": float(item.get("cgpa", 0))
                })
        
        df_marks_raw = pd.DataFrame(marks_data)
        
        # Pivot or Agg to get one row per student
        if not df_marks_raw.empty:
            # Simple average if multiple sems
            df_cgpa = df_marks_raw.groupby("student_id")["cgpa"].mean().reset_index()
            df_cgpa.rename(columns={"cgpa": "avg_cgpa"}, inplace=True)
        else:
            df_cgpa = pd.DataFrame(columns=["student_id", "avg_cgpa"])


        # 4. Process Fees
        # Input: List of fee records
        # Output: DataFrame with student_id, outstanding_months (calculated?)
        fees_data = []
        if payload.fees:
            # Logic: If status is 'pending', it counts as unpaid?
            # Or we look for 'outstanding_months' if it was passed (it's not in the mongoose model explicitly)
            # The mongoose model has 'amount' and 'status'.
            # Let's assume strict rule: Count number of 'pending' records per student? 
            # OR sum the amount? The ML `compute_fee_weight` uses `months_unpaid`.
            # Let's count pending records as months unpaid for now.
            
            fee_counts = {} # { rollNo: pending_count }
            
            for item in payload.fees:
                roll_no = item.get("rollNo")
                if not roll_no: continue
                
                status = item.get("status", "").lower()
                if roll_no not in fee_counts: fee_counts[roll_no] = 0
                
                if status == "pending":
                    fee_counts[roll_no] += 1
            
            for r, count in fee_counts.items():
                fees_data.append({"student_id": r, "outstanding_months": count})

        df_fees = pd.DataFrame(fees_data)
        if df_fees.empty:
            df_fees = pd.DataFrame(columns=["student_id", "outstanding_months"])


        # 5. Merge DataFrames
        # Base is all unique students found in any dataset
        all_students = set(df_att["student_id"].unique()) | \
                       set(df_cgpa["student_id"].unique()) | \
                       set(df_fees["student_id"].unique())
        
        df = pd.DataFrame({"student_id": list(all_students)})
        
        df = df.merge(df_att, on="student_id", how="left")
        df = df.merge(df_cgpa, on="student_id", how="left")
        df = df.merge(df_fees, on="student_id", how="left")
        
        # Fill NaNs
        if "attendance" in df.columns: df["attendance"] = df["attendance"].fillna(0)
        else: df["attendance"] = 0.0
        
        if "avg_cgpa" in df.columns: df["avg_cgpa"] = df["avg_cgpa"].fillna(0)
        else: df["avg_cgpa"] = 0.0
            
        if "outstanding_months" in df.columns: 
            df["outstanding_months"] = df["outstanding_months"].fillna(0)
        else:
             df["outstanding_months"] = 0

        # 6. Feature Engineering
        if "fee_weight" not in df.columns:
            df["fee_weight"] = df["outstanding_months"].apply(compute_fee_weight)
            
        # Verify columns required for rule score
        # compute_rule_columns needs: attendance, avg_cgpa, fee_weight
        df = compute_rule_columns(df)

        ml_features = ["attendance", "avg_cgpa", "fee_weight", "rule_score"]
        for col in ml_features:
            if col not in df.columns:
                df[col] = 0.0

        # 7. Predict
        df["ml_pred"] = ml_model.predict_proba(df[ml_features].fillna(0))[:, 1]

        # 8. Final Score
        df["final_score"] = ((df["ml_pred"] + df["rule_score"]) / 2) * 100
        # df["risk_zone"] = df["final_score"].apply(get_zone)

        # 9. Format Response
        # Expected response: { predictions: { "ROLL123": 85.5, ... } }
        predictions = {}
        for _, row in df.iterrows():
            predictions[row["student_id"]] = row["final_score"]
        
        # Optional: Save to DB like before if needed, but the Controller updates Student models directly now.
        # We can still save to predictions collection for history.
        records = df.to_dict(orient="records")
        if records:
            collection.insert_many(records)
            print(f"Saved {len(records)} records to MongoDB Atlas")

        return {
            "predictions": predictions,
            "count": len(predictions)
        }

    except Exception as e:
        print(f"Error during prediction: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Keep the Batch endpoint for backward compatibility or file uploads if needed
@app.post("/predict/batch")
async def batch_predict(
    attendance_csv: UploadFile = File(...),
    cgpa_csv: UploadFile = File(...),
    fees_csv: UploadFile = File(...)
):
    try:
        df_att = pd.read_csv(io.BytesIO(await attendance_csv.read()))
        df_cgpa = pd.read_csv(io.BytesIO(await cgpa_csv.read()))
        df_fees = pd.read_csv(io.BytesIO(await fees_csv.read()))


        if "fee_weight" not in df_fees.columns:
            df_fees["fee_weight"] = df_fees["outstanding_months"].apply(compute_fee_weight)


        df = df_att.merge(df_cgpa, on="student_id", how="left")
        df = df.merge(df_fees, on="student_id", how="left")


        if "avg_cgpa" not in df.columns:
            cgpa_cols = [c for c in df.columns if c.startswith("cgpa_sem")]
            if len(cgpa_cols) == 0:
                return {"error": "No columns found like cgpa_sem1, cgpa_sem2…"}
            df["avg_cgpa"] = df[cgpa_cols].mean(axis=1)


        df = compute_rule_columns(df)


        ml_features = ["attendance", "avg_cgpa", "fee_weight", "rule_score"]

       
        for col in ml_features:
            if col not in df.columns:
                df[col] = 0.0

        df["ml_pred"] = ml_model.predict_proba(df[ml_features].fillna(0))[:, 1]


        df["final_score"] = ((df["ml_pred"] + df["rule_score"]) / 2) * 100
        df["risk_zone"] = df["final_score"].apply(get_zone)

        records = df.to_dict(orient="records")
        collection.insert_many(records)
        print(f"Saved {len(records)} records to MongoDB Atlas")


        return {
            "total_records": len(df),
            "preview": df.head(10).to_dict(orient="records"),
            "full_data": df.to_dict(orient="records")
        }

    except Exception as e:
        return {"error": str(e)}



if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
