import pytest
from app.services.evaluator import safe_eval

class DummyPR:
    def __init__(self, amount: float, purchase_type: str, form_data: dict):
        self.amount = amount
        self.purchase_type = purchase_type
        self.form_data = form_data

def test_safe_eval_basic():
    context = {"pr": DummyPR(150000.0, "department", {"gem_nac_attached": True})}
    
    # Simple evaluations
    assert safe_eval("pr.amount > 100000", context) is True
    assert safe_eval("pr.amount < 100000", context) is False
    assert safe_eval("pr.purchase_type == 'department'", context) is True
    assert safe_eval("pr.purchase_type != 'office'", context) is True

def test_safe_eval_logical():
    context = {"pr": DummyPR(150000.0, "department", {"gem_nac_attached": True})}
    
    assert safe_eval("pr.amount > 100000 and pr.purchase_type == 'department'", context) is True
    assert safe_eval("pr.amount > 200000 or pr.purchase_type == 'department'", context) is True
    assert safe_eval("not (pr.amount < 100000)", context) is True
    
    # Test short-circuiting
    assert safe_eval("pr.amount < 100000 and pr.non_existent_field == 'test'", context) is False
    assert safe_eval("pr.amount > 100000 or pr.non_existent_field == 'test'", context) is True

def test_safe_eval_subscript_and_attributes():
    context = {"pr": DummyPR(150000.0, "department", {"gem_nac_attached": True, "vendor_count": 3})}
    
    # Dynamic dict key evaluation
    assert safe_eval("pr.form_data['gem_nac_attached'] == True", context) is True
    # Subscript attribute lookup fallback
    assert safe_eval("pr.form_data.vendor_count == 3", context) is True

def test_safe_eval_security_restrictions():
    context = {"pr": DummyPR(150000.0, "department", {})}
    
    # Try calling builtins or function execution (should raise TypeError or ValueError)
    with pytest.raises((TypeError, ValueError)):
        safe_eval("import os", context)
        
    with pytest.raises(TypeError):
        safe_eval("print('hello')", context)
        
    with pytest.raises(AttributeError):
        safe_eval("pr.amount.__class__", context)
