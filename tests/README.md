# DAO5102P Unit Tests

### Run all tests

```bash
# from the parent directory
python -m unittest discover -s tests -p "test_*.py" -v
```

### Run specific test

```bash
python -m unittest tests.test_DSO5102P.TestInit.test_device_not_found_exits -v
```

### Coverage Report

```bash
pip install coverage
coverage run -m unittest discover -s tests -p "test_*.py"
coverage report -m
coverage html
```

### Continuous Integration - GitHub Actions workflow

```yaml
- name: Run unit tests
  run: |
    python -m unittest discover -s tests -p "test_*.py" -v
    
- name: Check coverage
  run: |
    pip install coverage
    coverage run -m unittest discover -s tests -p "test_*.py"
    coverage report --fail-under=80
```