#!/usr/bin/env python3
import onnxruntime
print("Available ONNX Runtime providers:")
for provider in onnxruntime.get_available_providers():
    print(f"  - {provider}")