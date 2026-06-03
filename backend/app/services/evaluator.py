import ast
import operator
from typing import Any

# Define allowed AST node types and operators for security
_OPERATORS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Eq: operator.eq,
    ast.NotEq: operator.ne,
    ast.Lt: operator.lt,
    ast.LtE: operator.le,
    ast.Gt: operator.gt,
    ast.GtE: operator.ge,
    ast.USub: operator.neg,
    ast.Not: operator.not_,
}

def safe_eval(expr: str, context: dict) -> Any:
    """
    Safely evaluate a Python expression string within a given context.
    Only allows basic arithmetic, logical operators, comparisons, attribute access, and dict subscripting.
    """
    if not expr or not expr.strip():
        return False

    try:
        tree = ast.parse(expr.strip(), mode="eval")
    except SyntaxError as e:
        raise ValueError(f"Invalid syntax in rule expression: {expr}") from e

    def _eval(node: ast.AST) -> Any:
        if isinstance(node, ast.Expression):
            return _eval(node.body)
        
        # Constants: Numbers, strings, booleans, None
        elif isinstance(node, ast.Constant):
            return node.value
        
        # Legacy Python Constant nodes (Num, Str, NameConstant)
        elif type(node).__name__ == "Num":
            return node.n
        elif type(node).__name__ == "Str":
            return node.s
        elif type(node).__name__ == "NameConstant":
            return node.value

        # Variables: Context names
        elif isinstance(node, ast.Name):
            if node.id in context:
                return context[node.id]
            raise NameError(f"Name '{node.id}' is not defined in expression context")

        # Attribute Access: e.g. pr.amount
        elif isinstance(node, ast.Attribute):
            if node.attr.startswith("__"):
                raise AttributeError("Access to double-underscore attributes is forbidden")
            val = _eval(node.value)
            # Try attribute first, then dict lookup
            if hasattr(val, node.attr):
                return getattr(val, node.attr)
            elif isinstance(val, dict):
                return val.get(node.attr)
            raise AttributeError(f"'{type(val).__name__}' object has no attribute or key '{node.attr}'")

        # Subscript Access: e.g. pr.form_data['gem_nac_attached']
        elif isinstance(node, ast.Subscript):
            val = _eval(node.value)
            key = _eval(node.slice)
            # Support Index node for Python < 3.9
            if isinstance(key, ast.Index):
                key = _eval(key.value)
            try:
                return val[key]
            except Exception as e:
                raise KeyError(f"Key/index error for key '{key}'") from e

        # Logical operators: and, or
        elif isinstance(node, ast.BoolOp):
            if isinstance(node.op, ast.And):
                val = None
                for v in node.values:
                    val = _eval(v)
                    if not val:
                        return val
                return val
            elif isinstance(node.op, ast.Or):
                val = None
                for v in node.values:
                    val = _eval(v)
                    if val:
                        return val
                return val
            raise TypeError(f"Unsupported logical operator: {type(node.op)}")

        # Unary operators: not, -
        elif isinstance(node, ast.UnaryOp):
            if type(node.op) in _OPERATORS:
                return _OPERATORS[type(node.op)](_eval(node.operand))
            raise TypeError(f"Unsupported unary operator: {type(node.op)}")

        # Binary operations: +, -, *, /
        elif isinstance(node, ast.BinOp):
            if type(node.op) in _OPERATORS:
                return _OPERATORS[type(node.op)](_eval(node.left), _eval(node.right))
            raise TypeError(f"Unsupported binary operator: {type(node.op)}")

        # Comparisons: ==, !=, <, <=, >, >=
        elif isinstance(node, ast.Compare):
            left = _eval(node.left)
            for op_type, comparator in zip(node.ops, node.comparators):
                right = _eval(comparator)
                if type(op_type) not in _OPERATORS:
                    raise TypeError(f"Unsupported comparison operator: {type(op_type)}")
                if not _OPERATORS[type(op_type)](left, right):
                    return False
                left = right
            return True

        else:
            raise TypeError(f"Unsupported expression element: {type(node).__name__}")

    return _eval(tree)


def validate_json_schema(data: dict, schema: dict) -> None:
    """Validate data against a basic JSON schema. Raises ValueError if invalid."""
    if not schema:
        return
        
    s_type = schema.get("type")
    if s_type == "object":
        if not isinstance(data, dict):
            raise ValueError("Expected an object/dictionary")
            
        properties = schema.get("properties", {})
        required = schema.get("required", [])
        
        # Check required fields
        for field in required:
            if field not in data or data[field] is None:
                title = properties.get(field, {}).get("title", field)
                raise ValueError(f"Field '{title}' is required")
                
        # Check property types
        for field, val in data.items():
            if field in properties:
                prop_schema = properties[field]
                prop_type = prop_schema.get("type")
                prop_title = prop_schema.get("title", field)
                
                if prop_type == "string" and not isinstance(val, str):
                    raise ValueError(f"Field '{prop_title}' must be a string")
                elif prop_type == "number" and not isinstance(val, (int, float)):
                    raise ValueError(f"Field '{prop_title}' must be a number")
                elif prop_type == "integer" and not isinstance(val, int):
                    raise ValueError(f"Field '{prop_title}' must be an integer")
                elif prop_type == "boolean" and not isinstance(val, bool):
                    raise ValueError(f"Field '{prop_title}' must be a boolean")
                elif prop_type == "array" and not isinstance(val, list):
                    raise ValueError(f"Field '{prop_title}' must be an array/list")
                
                # Check enum
                prop_enum = prop_schema.get("enum")
                if prop_enum and val not in prop_enum:
                    raise ValueError(f"Field '{prop_title}' must be one of {prop_enum}")
